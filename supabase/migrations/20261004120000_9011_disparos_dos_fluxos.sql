-- ---- disparos dos fluxos (migration 9011) ----
-- 9011 (fork jhoow, Fluxos no modelo Leona, item 12) — a tela /app/disparos:
-- o que faz um fluxo começar, num lugar só, como no Leona.
--
--  1. `crm_fluxo_triggers`: as PALAVRAS-CHAVE. Cada uma tem nome, o fluxo que
--     dispara, a lógica (`or` = qualquer condição, `and` = todas) e a lista de
--     condições sobre o texto da mensagem que chegou — `[{operador, valor}]`,
--     operador em igual/contem/diferente/nao_contem/comeca/termina. O formato
--     de cada condição é cobrado pela API (Zod); aqui, só que é uma lista.
--  2. `crm_fluxo_global_triggers`: UMA linha por organização com os quatro
--     gatilhos globais — boas-vindas (primeira mensagem de contato novo),
--     conversa finalizada, resposta padrão (nenhum outro gatilho casou; no
--     máximo uma vez a cada N horas por contato) e atendimento finalizado.
--
-- O fluxo apontado é FK composta (mesma organização, `idx_followup_flow_
-- pointers_org_id` da 0394) com `on delete set null`: apagar o fluxo não
-- apaga a palavra-chave que a pessoa montou — ela fica sem destino e a tela
-- mostra isso. RLS: a organização lê; manager+ escreve (o mesmo de fluxo_pastas).
--
-- Aditiva e reaplicável: tabelas e índices `if not exists`, constraints e
-- policies recriadas por nome. Sem backfill (nada existia).

create table if not exists public.crm_fluxo_triggers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  fluxo_id uuid,
  logic_operator text not null default 'or' check (logic_operator in ('and', 'or')),
  conditions jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_fluxo_triggers
  drop constraint if exists crm_fluxo_triggers_fluxo_fkey;
alter table public.crm_fluxo_triggers
  add constraint crm_fluxo_triggers_fluxo_fkey
  foreign key (organization_id, fluxo_id)
  references public.followup_flow_pointers (organization_id, id)
  on delete set null (fluxo_id);

create index if not exists crm_fluxo_triggers_org_idx
  on public.crm_fluxo_triggers (organization_id, position);
create index if not exists crm_fluxo_triggers_fluxo_idx
  on public.crm_fluxo_triggers (fluxo_id) where fluxo_id is not null;

comment on table public.crm_fluxo_triggers is
  'Palavras-chave da tela Disparos (9011): condições sobre o texto que chega e o fluxo que começa.';

drop trigger if exists trg_crm_fluxo_triggers_touch on public.crm_fluxo_triggers;
create trigger trg_crm_fluxo_triggers_touch before update on public.crm_fluxo_triggers
  for each row execute function public.fn_touch_updated_at();

alter table public.crm_fluxo_triggers enable row level security;
drop policy if exists tenant_isolation_crm_fluxo_triggers_all on public.crm_fluxo_triggers;
create policy tenant_isolation_crm_fluxo_triggers_all on public.crm_fluxo_triggers
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );
revoke all on public.crm_fluxo_triggers from anon;

create table if not exists public.crm_fluxo_global_triggers (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  welcome_fluxo_id uuid,
  conversation_closed_fluxo_id uuid,
  default_response_fluxo_id uuid,
  default_response_hours integer not null default 24 check (default_response_hours between 1 and 720),
  attendance_closed_fluxo_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare
  coluna text;
begin
  foreach coluna in array array['welcome_fluxo_id', 'conversation_closed_fluxo_id',
                                'default_response_fluxo_id', 'attendance_closed_fluxo_id'] loop
    execute format('alter table public.crm_fluxo_global_triggers drop constraint if exists %I',
                   'crm_fluxo_global_triggers_' || coluna || '_fkey');
    execute format(
      'alter table public.crm_fluxo_global_triggers add constraint %I '
      'foreign key (organization_id, %I) references public.followup_flow_pointers (organization_id, id) '
      'on delete set null (%I)',
      'crm_fluxo_global_triggers_' || coluna || '_fkey', coluna, coluna);
  end loop;
end $$;

comment on table public.crm_fluxo_global_triggers is
  'Gatilhos globais da tela Disparos (9011): boas-vindas, conversa finalizada, resposta padrão (a cada N horas) e atendimento finalizado. Uma linha por organização.';

drop trigger if exists trg_crm_fluxo_global_triggers_touch on public.crm_fluxo_global_triggers;
create trigger trg_crm_fluxo_global_triggers_touch before update on public.crm_fluxo_global_triggers
  for each row execute function public.fn_touch_updated_at();

alter table public.crm_fluxo_global_triggers enable row level security;
drop policy if exists tenant_isolation_crm_fluxo_global_triggers_all on public.crm_fluxo_global_triggers;
create policy tenant_isolation_crm_fluxo_global_triggers_all on public.crm_fluxo_global_triggers
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );
revoke all on public.crm_fluxo_global_triggers from anon;

notify pgrst, 'reload schema';
