-- ---- fluxos: a superfície `fluxo` e as pastas da lista (migration 9002) ----
-- 9002 (fork jhoow, Etapa 2 do master plan, Fase A) — o construtor visual de
-- FLUXOS (/app/fluxos) reaproveita as tabelas de follow-up: um fluxo é uma linha
-- de `followup_flow_pointers` com `surface = 'fluxo'`. Versões, publicar,
-- rollback, execuções e eventos vêm de graça, com a RLS que já existe. A faixa
-- 9xxx é do fork: a numeração do upstream (05xx) segue sem colisão nos merges.
--
-- Três mudanças, todas aditivas e reaplicáveis:
--  1. `surface` aceita 'fluxo' (o CHECK da 0167/0394, refeito com a lista toda);
--  2. `fluxo_pastas`: as pastas (e subpastas) da tela de lista;
--  3. `followup_flow_pointers.pasta_id`: em que pasta o fluxo mora.
--
-- A pasta e o fluxo são da MESMA organização por construção: as duas chaves
-- estrangeiras são compostas (organization_id, id). Apagar uma pasta apaga as
-- subpastas e devolve os fluxos dela para a raiz (`set null (pasta_id)`, que só
-- anula a coluna da pasta — o organization_id do fluxo não é tocado).

-- 1. a superfície
alter table public.followup_flow_pointers
  drop constraint if exists followup_flow_pointers_surface_check;
alter table public.followup_flow_pointers
  add constraint followup_flow_pointers_surface_check
  check (surface in ('followup', 'crm_automation', 'atendimento', 'fluxo'));

-- 2. as pastas
create table if not exists public.fluxo_pastas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  parent_id uuid,
  posicao integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fluxo_pastas_org_id_key unique (organization_id, id),
  constraint fluxo_pastas_nao_e_pai_de_si check (parent_id is distinct from id)
);

alter table public.fluxo_pastas
  drop constraint if exists fluxo_pastas_parent_fkey;
alter table public.fluxo_pastas
  add constraint fluxo_pastas_parent_fkey
  foreign key (organization_id, parent_id)
  references public.fluxo_pastas (organization_id, id) on delete cascade;

create index if not exists fluxo_pastas_org_parent_idx
  on public.fluxo_pastas (organization_id, parent_id, posicao);

comment on table public.fluxo_pastas is
  'Pastas da lista de Fluxos (/app/fluxos). Subpasta = parent_id; apagar a pasta apaga as subpastas e devolve os fluxos à raiz.';

drop trigger if exists trg_fluxo_pastas_touch on public.fluxo_pastas;
create trigger trg_fluxo_pastas_touch before update on public.fluxo_pastas
  for each row execute function public.fn_touch_updated_at();

alter table public.fluxo_pastas enable row level security;
drop policy if exists tenant_isolation_fluxo_pastas_all on public.fluxo_pastas;
create policy tenant_isolation_fluxo_pastas_all on public.fluxo_pastas
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );
revoke all on public.fluxo_pastas from anon;

-- 3. a pasta do fluxo
alter table public.followup_flow_pointers
  add column if not exists pasta_id uuid;
alter table public.followup_flow_pointers
  drop constraint if exists followup_flow_pointers_pasta_fkey;
alter table public.followup_flow_pointers
  add constraint followup_flow_pointers_pasta_fkey
  foreign key (organization_id, pasta_id)
  references public.fluxo_pastas (organization_id, id) on delete set null (pasta_id);

create index if not exists followup_flow_pointers_pasta_idx
  on public.followup_flow_pointers (organization_id, pasta_id)
  where pasta_id is not null;

comment on column public.followup_flow_pointers.pasta_id is
  'Pasta da lista de Fluxos (só surface = fluxo). Nula = raiz.';

notify pgrst, 'reload schema';
