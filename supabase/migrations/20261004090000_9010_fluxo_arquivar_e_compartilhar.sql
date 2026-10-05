-- ---- fluxos: arquivar e compartilhar (migration 9010) ----
-- 9010 (fork jhoow, Fluxos no modelo Leona, item 2) — o menu "⋯" da lista de
-- Fluxos ganha Arquivar e Compartilhar.
--
--  1. `followup_flow_pointers.archived_at`: o fluxo arquivado sai de "Todos",
--     "Ativos" e "Pausados" e aparece só no filtro "Arquivados". É coluna, e não
--     um quarto valor de `status`: o status é lido pelo motor e pelos gatilhos
--     de follow-up, e arquivar não pode mudar o significado dele. Arquivar um
--     fluxo ativo o desativa antes (a rota faz os dois).
--  2. `followup_flow_pointers.share_token`: o link somente-leitura
--     /app/fluxos/shared/<token>. Nulo = não compartilhado. Único.
--  3. `fn_fluxo_compartilhado(token)`: quem abre o link pode ser de OUTRA
--     organização (é para isso que se compartilha) e a RLS do ponteiro é por
--     organização. Definer ESTÁVEL que devolve só nome e grafo do fluxo com
--     aquele token — nada de id, organização, versão ou status. Só
--     `authenticated` (e service_role).
--
-- Aditiva e reaplicável: colunas nullable sem backfill, índice e função
-- recriados por nome.

alter table public.followup_flow_pointers
  add column if not exists archived_at timestamptz;

alter table public.followup_flow_pointers
  add column if not exists share_token uuid;

comment on column public.followup_flow_pointers.archived_at is
  'Fluxo arquivado (9010): some dos filtros comuns da lista de Fluxos; nulo = não arquivado.';
comment on column public.followup_flow_pointers.share_token is
  'Token do link somente-leitura /app/fluxos/shared/<token> (9010); nulo = não compartilhado.';

create unique index if not exists followup_flow_pointers_share_token_key
  on public.followup_flow_pointers (share_token)
  where share_token is not null;

create or replace function public.fn_fluxo_compartilhado(p_token uuid)
returns table (nome text, grafo jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.name::text, coalesce(p.draft_graph, v.graph)
    from public.followup_flow_pointers p
    left join public.followup_flow_versions v
      on v.id = p.active_version_id
     and v.organization_id = p.organization_id
   where p_token is not null
     and p.share_token = p_token
     and p.surface = 'fluxo'
   limit 1;
$$;

revoke all on function public.fn_fluxo_compartilhado(uuid) from public, anon;
grant execute on function public.fn_fluxo_compartilhado(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
