-- ---- um lead aberto por CRM e arquivar CRM com o funil principal (migration 9009) ----
-- 9009 (fork jhoow, Funis no modelo Kommo, Fase D).
--
-- 1. UM LEAD ABERTO POR CRM. `fn_nascer_lead_da_conversa` recusava (devolvia
--    NULL) se o contato tivesse QUALQUER lead aberto na organização. Com o
--    roteamento por número (cada número de WhatsApp leva a um CRM), um contato
--    com lead aberto na Apex que escreve para o número da PA Advogados ficaria
--    sem card na PA. Agora a recusa olha só o CRM do funil de destino. Mesma
--    assinatura, mesma trava (advisory lock por organização + contato), mesmos
--    grants.
--
-- 2. ARQUIVAR CRM VOLTOU A SER POSSÍVEL. A 9007 tornou o funil principal fixo
--    (não desmarca, não arquiva) e a regra de arquivar CRM exige zero funil
--    vivo: juntas, nenhum CRM com funil podia mais ser arquivado. Agora:
--    - a guarda deixa desmarcar o principal quando o CRM dele está ARQUIVADO;
--    - `fn_crm_arquivar` arquiva o CRM, os funis vivos dele (o principal
--      inclusive) e desfaz os vínculos de número, numa transação só. Quem
--      decide SE pode (CRM padrão, funil padrão, formulário ou automação
--      apontando) é a rota — a função é `security invoker`, a RLS manager+
--      das três tabelas vale;
--    - funil que volta do arquivo num CRM sem principal vira o principal (o
--      gatilho de nascimento passa a olhar também o UPDATE de `is_archived`), e
--      ganha a Etapa de entrada se não tiver.
--
-- Reaplicável: `create or replace` e gatilhos recriados por nome.

-- 1. um lead aberto por CRM
create or replace function public.fn_nascer_lead_da_conversa(
  p_org uuid,
  p_contact uuid,
  p_pipeline uuid,
  p_stage uuid,
  p_title text,
  p_source text,
  p_source_metadata jsonb default '{}'::jsonb,
  p_tags text[] default '{}'::text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_contact::text, 0));

  -- Só o lead aberto do MESMO CRM do funil de destino conta (9009). Funil sem
  -- CRM não existe desde a 9004 (NOT NULL), mas o `is not distinct from` mantém
  -- a regra antiga caso exista.
  select l.id into v_id
    from public.crm_leads l
    join public.crm_pipelines p on p.id = l.pipeline_id
   where l.organization_id = p_org
     and l.contact_id = p_contact
     and l.status = 'open'
     and p.crm_id is not distinct from (select d.crm_id from public.crm_pipelines d where d.id = p_pipeline)
   limit 1;

  if v_id is not null then
    return null;
  end if;

  insert into public.crm_leads
    (organization_id, pipeline_id, stage_id, contact_id, title, source, source_metadata, tags, currency)
  values
    (p_org, p_pipeline, p_stage, p_contact, p_title, p_source, coalesce(p_source_metadata, '{}'::jsonb), coalesce(p_tags, '{}'::text[]),
     coalesce((select o.currency from public.organizations o where o.id = p_org), 'BRL'))
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.fn_nascer_lead_da_conversa(uuid, uuid, uuid, uuid, text, text, jsonb, text[]) from public, anon;
grant  execute on function public.fn_nascer_lead_da_conversa(uuid, uuid, uuid, uuid, text, text, jsonb, text[]) to authenticated, service_role;

-- 2a. a guarda do principal deixa desmarcar quando o CRM está arquivado
create or replace function public.fn_crm_guarda_funil_principal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.is_primary and not new.is_primary and not exists (
       select 1 from public.crm_crms c where c.id = new.crm_id and c.archived_at is not null) then
    raise exception 'funil_principal_fixo' using errcode = 'PT409';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_crm_guarda_funil_principal() from public, anon, authenticated;

-- 2b. funil que volta do arquivo num CRM sem principal vira o principal
-- (`fn_crm_funil_principal_nasce` da 9007 já decide por "vivo e sem outro
-- principal no CRM"; aqui ela passa a rodar também no UPDATE de `is_archived`).
-- O gatilho de entrada passa a rodar em QUALQUER update, não só no de
-- `is_primary`: gatilho `update of <coluna>` só dispara quando a coluna está no
-- SET do comando, e a promoção acima muda `is_primary` por dentro do gatilho
-- BEFORE. A função só age em funil principal sem entrada (uma leitura barata).
drop trigger if exists trg_crm_pipelines_principal on public.crm_pipelines;
create trigger trg_crm_pipelines_principal
  before insert or update of is_archived on public.crm_pipelines
  for each row execute function public.fn_crm_funil_principal_nasce();

drop trigger if exists trg_crm_pipelines_entrada on public.crm_pipelines;
create trigger trg_crm_pipelines_entrada
  after insert or update on public.crm_pipelines
  for each row execute function public.fn_crm_etapa_de_entrada_nasce();

-- 2c. arquivar o CRM com os funis dele, numa transação só
create or replace function public.fn_crm_arquivar(p_crm uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- O CRM primeiro: é o CRM arquivado que libera desmarcar o principal (2a).
  update public.crm_crms set archived_at = now() where id = p_crm and archived_at is null;
  if not found then
    raise exception 'crm_nao_encontrado' using errcode = 'P0002';
  end if;

  update public.crm_pipelines
     set is_primary = false, is_archived = true
   where crm_id = p_crm and not is_archived;

  -- Número ligado a CRM arquivado volta a cair no CRM padrão; apagar o vínculo
  -- deixa isso explícito na tela de números, em vez de um vínculo morto.
  delete from public.crm_waha_session_bindings where crm_id = p_crm;
end;
$$;

revoke execute on function public.fn_crm_arquivar(uuid) from public, anon;
grant execute on function public.fn_crm_arquivar(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
