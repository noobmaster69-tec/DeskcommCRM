-- ---- CRMs: as métricas dos cards numa passada só (migration 9006) ----
-- 9006 (fork jhoow, CRMs, Fase B) — `fn_crms_com_metricas` (9004) fazia um
-- `left join lateral` por CRM, e o plano lia `crm_leads` INTEIRA uma vez para
-- cada CRM. Medido num pg15 descartável com o baseline (3 CRMs, 10 funis):
--   10 mil negócios  →  6–11 ms
--  100 mil negócios  → 80–115 ms, `Seq Scan on crm_leads ... loops=3`
-- O custo crescia com (negócios × CRMs). Aqui os negócios são agrupados por
-- funil UMA vez e só então somados por CRM: uma leitura da tabela, qualquer que
-- seja o número de CRMs. Medido no mesmo banco depois da troca:
--   10 mil negócios  →  ~3,5 ms
--  100 mil negócios  → 34–41 ms
-- Cache (Redis/visão materializada) segue desnecessário nessa escala.
--
-- Mesmo contrato (nome, argumentos, colunas, ordem, security invoker, grants):
-- a tela e a API não mudam. `create or replace` — reaplicável.
create or replace function public.fn_crms_com_metricas(p_org uuid)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  is_default boolean,
  avatar_bg_color text,
  created_at timestamptz,
  updated_at timestamptz,
  leads_count bigint,
  funis_count bigint,
  last_updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with funis as (
    select p.id, p.crm_id
      from public.crm_pipelines p
     where p.organization_id = p_org
       and not p.is_archived
  ),
  por_funil as (
    select l.pipeline_id, count(*) as leads, max(l.updated_at) as ultimo
      from public.crm_leads l
      join funis f on f.id = l.pipeline_id
     where l.organization_id = p_org
     group by l.pipeline_id
  )
  select c.id, c.name, c.slug, c.description, c.is_default, c.avatar_bg_color,
         c.created_at, c.updated_at,
         coalesce(sum(pf.leads), 0)::bigint,
         count(f.id),
         max(pf.ultimo)
    from public.crm_crms c
    left join funis f on f.crm_id = c.id
    left join por_funil pf on pf.pipeline_id = f.id
   where c.organization_id = p_org
     and c.archived_at is null
   group by c.id
   order by c.is_default desc, c.name asc
$$;

revoke execute on function public.fn_crms_com_metricas(uuid) from public, anon;
grant execute on function public.fn_crms_com_metricas(uuid) to authenticated, service_role;
