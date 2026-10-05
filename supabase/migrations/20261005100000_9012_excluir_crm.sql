-- ---- excluir CRM de vez (migration 9012) ----
-- 9012 (fork jhoow, card de CRM reorganizado) — o "Excluir" do menu "⋯" do
-- card. Arquivar (9009) continua sendo o caminho de quem TEM história; excluir
-- é para o CRM que nunca recebeu negócio (criado por engano, teste).
--
-- `fn_crm_excluir(p_crm)` — SECURITY INVOKER (a RLS manager+ de crm_crms e
-- crm_pipelines decide quem pode), numa transação só, e RECUSA antes de apagar:
--   - o CRM padrão                                   → crm_padrao;
--   - qualquer negócio em qualquer funil (vivo ou arquivado) → crm_com_negocios
--     (o FK de crm_leads já é RESTRICT; a recusa aqui dá a frase certa);
--   - fonte de captura (webhook_sources) apontando um funil dele → crm_com_captura
--     (aquele FK é CASCADE: apagaria a configuração do cliente em silêncio);
--   - regra de conversão do Google Ads numa etapa dele → crm_com_conversao
--     (também CASCADE).
-- Apaga os funis (as etapas vão por CASCADE) e o CRM (os vínculos de número,
-- 9007, também). Automações que citam o funil no jsonb `actions` são barradas
-- pela rota (lerDependencias), a mesma régua do excluir funil.
--
-- Aditiva e reaplicável (`create or replace`).

-- As regras de conversão do Google Ads não têm GRANT para `authenticated` (são
-- do servidor). A pergunta "este CRM tem regra?" passa por um definer ESTÁVEL
-- que só responde sim/não, e só sobre CRM de organização de quem pergunta.
create or replace function public.fn_crm_tem_conversao_google(p_crm uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.google_ads_conversion_rules g
      join public.crm_stages s on s.id = g.stage_id and s.organization_id = g.organization_id
      join public.crm_pipelines p on p.id = s.pipeline_id
     where p.crm_id = p_crm
       and (auth.uid() is null or p.organization_id in (select public.fn_user_org_ids()))
  );
$$;

revoke all on function public.fn_crm_tem_conversao_google(uuid) from public, anon;
grant execute on function public.fn_crm_tem_conversao_google(uuid) to authenticated, service_role;

create or replace function public.fn_crm_excluir(p_crm uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_padrao boolean;
begin
  select organization_id, is_default into v_org, v_padrao
    from public.crm_crms where id = p_crm;
  if v_org is null then
    raise exception 'crm_inexistente' using errcode = 'P0002';
  end if;
  if v_padrao then
    raise exception 'crm_padrao' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.crm_leads l
               join public.crm_pipelines p on p.id = l.pipeline_id
              where p.crm_id = p_crm) then
    raise exception 'crm_com_negocios' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.webhook_sources w
               join public.crm_pipelines p on p.id = w.default_pipeline_id
              where p.crm_id = p_crm) then
    raise exception 'crm_com_captura' using errcode = 'P0001';
  end if;
  if public.fn_crm_tem_conversao_google(p_crm) then
    raise exception 'crm_com_conversao' using errcode = 'P0001';
  end if;

  delete from public.crm_pipelines where crm_id = p_crm and organization_id = v_org;
  delete from public.crm_crms where id = p_crm and organization_id = v_org;
  if not found then
    -- a RLS escondeu a linha (papel abaixo de manager): nada foi apagado
    raise exception 'crm_sem_permissao' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.fn_crm_excluir(uuid) from public, anon;
grant execute on function public.fn_crm_excluir(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
