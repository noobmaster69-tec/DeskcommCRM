-- ---- funil principal e etapa de entrada (migration 9007) ----
-- 9007 (fork jhoow, Funis no modelo Kommo, Fase A) — dentro de um CRM, o
-- PRIMEIRO funil é o principal, e só ele tem a "Etapa de entrada": a coluna
-- fixa onde cai todo contato novo daquele CRM. Os outros funis do CRM
-- (adicionais) têm só as colunas que o usuário criar.
--
-- Tudo aditivo e reaplicável:
--  1. `crm_pipelines.is_primary` e `crm_stages.is_entry`, com CHECKs: a entrada
--     não fecha negócio nem se arquiva; o principal não se arquiva;
--  2. backfill genérico — em cada CRM sem principal, o funil padrão da org (se
--     estiver nele) ou o mais antigo vivo vira principal, e ganha a entrada como
--     primeira coluna (`position` = menor − 1000; as outras não se movem, porque
--     `position` é numérica);
--  3. índices únicos parciais: um principal por CRM, uma entrada por funil;
--  4. gatilhos de nascimento: o primeiro funil vivo de um CRM vira principal e
--     ganha a entrada, por QUALQUER caminho (tela, API, MCP, seed de organização
--     nova, importar, `fn_crm_duplicar`, a imagem anterior a esta migration);
--  5. guarda: a entrada não se renomeia, não muda de funil, não deixa de ser
--     entrada e só existe no principal; o principal não deixa de ser principal.
--     ⚠️ DELETE NÃO É GUARDADO NO BANCO, de propósito: o "excluir" das telas
--     arquiva (`arquivarEtapa`), e arquivar já é recusado pelo CHECK. Guardar o
--     DELETE quebraria a cascata de `delete from organizations` e toda limpeza
--     por SQL. Funil principal apagado por SQL se cura sozinho: o próximo funil
--     criado no CRM vira principal;
--  6. `fn_crm_duplicar` (9004) copia o principal PRIMEIRO e não copia a
--     entrada (o gatilho cria a do CRM novo); `fn_aplicar_quadro_do_onboarding`
--     (0156) troca as colunas do onboarding preservando a entrada;
--  7. `crm_waha_session_bindings`: qual CRM recebe os contatos novos de cada
--     número de WhatsApp. Aponta para `channel_sessions.id` (o nome da sessão no
--     WAHA é técnico e pode mudar), um CRM por número, FKs compostas na mesma
--     organização; RLS espelhada de `crm_crms` (lê quem é da org, escreve
--     manager+). Quem LÊ o vínculo é a Fase D (`lib/leads/nascimento-do-lead.ts`).
--
-- Sem constraint de "sempre há um CRM padrão": arquivar o padrão já é recusado
-- (CHECK da 9004), e organização sem funil nenhum é estado válido.

-- 1. colunas e CHECKs
alter table public.crm_pipelines
  add column if not exists is_primary boolean not null default false;

comment on column public.crm_pipelines.is_primary is
  'Funil principal do CRM (9007): o unico com a etapa de entrada, onde cai todo '
  'contato novo do CRM. Exatamente um por CRM com funil vivo; nao se arquiva.';

alter table public.crm_stages
  add column if not exists is_entry boolean not null default false;

comment on column public.crm_stages.is_entry is
  'Etapa de entrada (9007): primeira coluna fixa do funil principal. Nao se '
  'renomeia, nao se arquiva, nao fecha negocio. Uma por funil.';

-- Os CHECKs entram antes do backfill sem nada a corrigir: as colunas nascem
-- `false` em toda linha, e na reaplicação os próprios CHECKs já valem.
alter table public.crm_pipelines drop constraint if exists crm_pipelines_principal_nao_arquiva;
alter table public.crm_pipelines add constraint crm_pipelines_principal_nao_arquiva
  check (not (is_primary and is_archived));

alter table public.crm_stages drop constraint if exists crm_stages_entrada_nao_fecha;
alter table public.crm_stages add constraint crm_stages_entrada_nao_fecha
  check (not (is_entry and (is_won or is_lost or is_archived)));

-- 2. backfill (qualquer org, qualquer clone; reaplicar não acha o que fazer)
-- 2a. o funil principal de cada CRM que ainda não tem
with candidato as (
  select distinct on (p.crm_id) p.id
    from public.crm_pipelines p
   where not p.is_archived
     and not exists (select 1 from public.crm_pipelines q
                      where q.crm_id = p.crm_id and q.is_primary)
   order by p.crm_id, p.is_default desc, p.created_at, p.id
)
update public.crm_pipelines
   set is_primary = true
 where id in (select id from candidato);

-- 2b. a etapa de entrada de cada principal que ainda não tem. O slug leva o id
-- do funil: nunca colide com etapa existente nem com modelo de onboarding.
insert into public.crm_stages (organization_id, pipeline_id, name, slug, position, is_entry)
select p.organization_id,
       p.id,
       'Etapa de entrada',
       'entrada-' || substr(md5(p.id::text), 1, 6),
       coalesce((select min(s.position) from public.crm_stages s where s.pipeline_id = p.id), 1000) - 1000,
       true
  from public.crm_pipelines p
 where p.is_primary
   and not exists (select 1 from public.crm_stages s where s.pipeline_id = p.id and s.is_entry);

-- 3. exclusividade
create unique index if not exists uniq_crm_pipelines_crm_primary
  on public.crm_pipelines (crm_id) where (is_primary = true);
create unique index if not exists uniq_crm_stages_pipeline_entry
  on public.crm_stages (pipeline_id) where (is_entry = true);

-- 4. nascimento
-- BEFORE INSERT: roda DEPOIS de `trg_crm_pipelines_preencher_crm` (ordem
-- alfabética dos gatilhos: "preencher" < "principal"), então `crm_id` já vem
-- preenchido com o padrão quando o chamador não o informou.
create or replace function public.fn_crm_funil_principal_nasce()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not new.is_archived and not exists (
       select 1 from public.crm_pipelines q
        where q.crm_id = new.crm_id and q.is_primary and q.id <> new.id) then
    new.is_primary := true;
  end if;
  return new;
end;
$$;

-- AFTER INSERT: a entrada nasce com o funil, antes de qualquer etapa que o
-- chamador crie em seguida — por isso `position` 0 e não "menor − 1000".
create or replace function public.fn_crm_etapa_de_entrada_nasce()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_primary and not exists (
       select 1 from public.crm_stages s where s.pipeline_id = new.id and s.is_entry) then
    insert into public.crm_stages (organization_id, pipeline_id, name, slug, position, is_entry)
    values (
      new.organization_id,
      new.id,
      'Etapa de entrada',
      'entrada-' || substr(md5(new.id::text), 1, 6),
      coalesce((select min(s.position) from public.crm_stages s where s.pipeline_id = new.id), 1000) - 1000,
      true
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_crm_pipelines_principal on public.crm_pipelines;
create trigger trg_crm_pipelines_principal
  before insert on public.crm_pipelines
  for each row execute function public.fn_crm_funil_principal_nasce();

drop trigger if exists trg_crm_pipelines_entrada on public.crm_pipelines;
create trigger trg_crm_pipelines_entrada
  after insert on public.crm_pipelines
  for each row execute function public.fn_crm_etapa_de_entrada_nasce();

-- 5. guardas (SQLSTATE PT409: a API traduz em 409 com o motivo)
create or replace function public.fn_crm_guarda_funil_principal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.is_primary and not new.is_primary then
    raise exception 'funil_principal_fixo' using errcode = 'PT409';
  end if;
  return new;
end;
$$;

create or replace function public.fn_crm_guarda_etapa_de_entrada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_entry and not exists (
       select 1 from public.crm_pipelines p where p.id = new.pipeline_id and p.is_primary) then
    raise exception 'entrada_so_no_funil_principal' using errcode = 'PT409';
  end if;
  if tg_op = 'UPDATE' and old.is_entry
     and (not new.is_entry or new.name is distinct from old.name
          or new.pipeline_id is distinct from old.pipeline_id) then
    raise exception 'etapa_de_entrada_fixa' using errcode = 'PT409';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_pipelines_guarda_principal on public.crm_pipelines;
create trigger trg_crm_pipelines_guarda_principal
  before update of is_primary on public.crm_pipelines
  for each row execute function public.fn_crm_guarda_funil_principal();

drop trigger if exists trg_crm_stages_guarda_entrada on public.crm_stages;
create trigger trg_crm_stages_guarda_entrada
  before insert or update on public.crm_stages
  for each row execute function public.fn_crm_guarda_etapa_de_entrada();

-- Funções de gatilho não são RPC útil, mas nascem com EXECUTE para PUBLIC e anon
-- como qualquer outra (CLAUDE.md, migrations, item 9).
revoke execute on function public.fn_crm_funil_principal_nasce() from public, anon, authenticated;
revoke execute on function public.fn_crm_etapa_de_entrada_nasce() from public, anon, authenticated;
revoke execute on function public.fn_crm_guarda_funil_principal() from public, anon, authenticated;
revoke execute on function public.fn_crm_guarda_etapa_de_entrada() from public, anon, authenticated;

-- 6a. duplicar (9004): o principal é copiado PRIMEIRO — senão o gatilho do item
-- 4 elegeria o primeiro funil copiado e a cópia do principal bateria no índice
-- único — e a entrada não é copiada, porque o gatilho já criou a do CRM novo.
create or replace function public.fn_crm_duplicar(p_crm uuid, p_name text, p_slug text)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_novo uuid;
  v_pipe uuid;
  v_nome text;
  v_pos numeric;
  v_n integer;
  r public.crm_pipelines;
begin
  select organization_id into v_org
    from public.crm_crms
   where id = p_crm and archived_at is null;
  if v_org is null then
    raise exception 'crm_nao_encontrado' using errcode = 'P0002';
  end if;

  insert into public.crm_crms (organization_id, name, slug, description, avatar_bg_color, is_default)
  select v_org, btrim(p_name), p_slug, description, avatar_bg_color, false
    from public.crm_crms where id = p_crm
  returning id into v_novo;

  select coalesce(max(position), 0) into v_pos
    from public.crm_pipelines where organization_id = v_org;

  for r in
    select * from public.crm_pipelines
     where crm_id = p_crm and organization_id = v_org and not is_archived
     order by is_primary desc, position
  loop
    -- O nome de funil é único entre os vivos da org (regra da tela, sem índice):
    -- a cópia leva o nome do CRM novo, e um contador se ainda colidir.
    v_nome := left(r.name || ' (' || btrim(p_name) || ')', 80);
    v_n := 1;
    while exists (
      select 1 from public.crm_pipelines
       where organization_id = v_org and not is_archived
         and lower(btrim(name)) = lower(btrim(v_nome))
    ) loop
      v_n := v_n + 1;
      v_nome := left(r.name || ' (' || btrim(p_name) || ' ' || v_n || ')', 80);
    end loop;

    v_pipe := gen_random_uuid();
    v_pos := v_pos + 1000;

    insert into public.crm_pipelines
    select (jsonb_populate_record(
      null::public.crm_pipelines,
      to_jsonb(r) || jsonb_build_object(
        'id', v_pipe,
        'crm_id', v_novo,
        'name', v_nome,
        'slug', left(r.slug, 33) || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
        'position', v_pos,
        'is_default', false,
        'is_client_pipeline', false,
        'is_archived', false,
        'created_at', now(),
        'updated_at', now()
      )
    )).*;

    insert into public.crm_stages
    select (jsonb_populate_record(
      null::public.crm_stages,
      to_jsonb(s) || jsonb_build_object(
        'id', gen_random_uuid(),
        'pipeline_id', v_pipe,
        'created_at', now(),
        'updated_at', now()
      )
    )).*
      from public.crm_stages s
     where s.pipeline_id = r.id and not s.is_archived and not s.is_entry;
  end loop;

  return v_novo;
end;
$$;

revoke execute on function public.fn_crm_duplicar(uuid, text, text) from public, anon;
grant execute on function public.fn_crm_duplicar(uuid, text, text) to authenticated, service_role;

-- 6b. o quadro do onboarding (0156) troca as colunas MENOS a entrada: o funil
-- semeado em organização nova já nasce principal (item 4), e sem este recorte o
-- DELETE apagaria a coluna fixa. As colunas do modelo entram depois dela (as
-- posições do modelo começam em 1000; a entrada está em 0).
create or replace function public.fn_aplicar_quadro_do_onboarding(
  p_organization_id uuid,
  p_pipeline_id uuid,
  p_nome text,
  p_slug text,
  p_etapas jsonb
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_negocios bigint;
  v_fontes bigint;
  v_criadas bigint;
begin
  -- O funil é DESTA organização? A função roda como `postgres` e passa por cima
  -- da RLS; o filtro de tenant é responsabilidade dela.
  perform 1 from public.crm_pipelines
   where id = p_pipeline_id and organization_id = p_organization_id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'funil_nao_encontrado');
  end if;

  select count(*) into v_negocios
    from public.crm_leads
   where pipeline_id = p_pipeline_id
     and organization_id = p_organization_id;

  if v_negocios > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'funil_com_negocios', 'quantos', v_negocios);
  end if;

  -- ON DELETE CASCADE: sem esta recusa, trocar as colunas apaga a fonte inteira.
  select count(*) into v_fontes
    from public.webhook_sources w
    join public.crm_stages s on s.id = w.default_stage_id
   where s.pipeline_id = p_pipeline_id;

  if v_fontes > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'etapa_em_uso_por_webhook', 'quantos', v_fontes);
  end if;

  delete from public.crm_stages
   where pipeline_id = p_pipeline_id
     and organization_id = p_organization_id
     and not is_entry;

  insert into public.crm_stages
    (organization_id, pipeline_id, name, slug, position, is_won, is_lost, agent_stage_hint)
  select p_organization_id,
         p_pipeline_id,
         e->>'nome',
         e->>'slug',
         (e->>'position')::numeric,
         coalesce((e->>'is_won')::boolean, false),
         coalesce((e->>'is_lost')::boolean, false),
         nullif(e->>'agent_stage_hint', '')
    from jsonb_array_elements(p_etapas) as e;
  get diagnostics v_criadas = row_count;

  update public.crm_pipelines
     set name = p_nome,
         slug = p_slug,
         updated_at = now()
   where id = p_pipeline_id
     and organization_id = p_organization_id;

  return jsonb_build_object('ok', true, 'etapas', v_criadas);
end$$;

revoke execute on function public.fn_aplicar_quadro_do_onboarding(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.fn_aplicar_quadro_do_onboarding(uuid, uuid, text, text, jsonb)
  to service_role;

-- 7. qual CRM recebe os contatos novos de cada número
-- Alvo da FK composta: `channel_sessions` só tinha `id` único.
create unique index if not exists uniq_channel_sessions_org_id
  on public.channel_sessions (organization_id, id);

create table if not exists public.crm_waha_session_bindings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_session_id uuid not null,
  crm_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Um número, um CRM. Vários números no mesmo CRM é permitido.
  constraint crm_waha_bindings_session_key unique (channel_session_id),
  constraint crm_waha_bindings_session_fkey foreign key (organization_id, channel_session_id)
    references public.channel_sessions (organization_id, id) on delete cascade,
  -- Apagar o CRM desfaz o vínculo: o número volta a cair no CRM padrão.
  constraint crm_waha_bindings_crm_fkey foreign key (organization_id, crm_id)
    references public.crm_crms (organization_id, id) on delete cascade
);

comment on table public.crm_waha_session_bindings is
  'Numero de WhatsApp (channel_sessions) -> CRM que recebe os contatos novos dele '
  '(fork jhoow, 9007). Numero sem vinculo cai no CRM padrao da organizacao.';

create index if not exists idx_crm_waha_bindings_crm
  on public.crm_waha_session_bindings (crm_id);

drop trigger if exists trg_crm_waha_bindings_updated_at on public.crm_waha_session_bindings;
create trigger trg_crm_waha_bindings_updated_at
  before update on public.crm_waha_session_bindings
  for each row execute function public.fn_set_updated_at();

alter table public.crm_waha_session_bindings enable row level security;

drop policy if exists "crm_waha_bindings_select" on public.crm_waha_session_bindings;
drop policy if exists "crm_waha_bindings_manager_write" on public.crm_waha_session_bindings;

create policy "crm_waha_bindings_select" on public.crm_waha_session_bindings
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "crm_waha_bindings_manager_write" on public.crm_waha_session_bindings
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

notify pgrst, 'reload schema';
