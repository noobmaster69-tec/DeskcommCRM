-- ---- variáveis da organização (migration 9013) ----
-- 9013 (fork jhoow, Campanhas › item 2) — as DEFINIÇÕES das variáveis
-- personalizadas da organização (tela Configurações › Variáveis).
--
-- O VALOR de cada variável continua em `contacts.custom_fields[chave]` (0211):
-- é a coluna que a anonimização LGPD já limpa (trigger no estado), que os
-- Fluxos já leem como `{campo}` e que a importação de lista grava. Uma tabela
-- de valores separada (`contact_field_values`) seria um segundo lugar de PII
-- que a anonimização não alcança — e dois lugares para o mesmo dado divergem.
--
-- Aqui mora só o que a ficha não sabia: o NOME humano, o TIPO, as opções de
-- seleção, o valor padrão, a ordem e se aparece no perfil.
--
-- A chave é snake_case e não pode reusar o nome de uma variável do SISTEMA
-- (primeiro_nome, saudacao_horario…) — a lista vive em
-- `lib/variables/sistema.ts` e é conferida pela API; o CHECK aqui guarda o
-- formato. Aditiva e reaplicável.

create table if not exists public.contact_custom_fields (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (length(btrim(label)) between 1 and 80),
  type text not null default 'texto' check (type in ('texto', 'numero', 'data', 'booleano', 'selecao')),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  default_value text check (default_value is null or length(default_value) <= 500),
  position integer not null default 0,
  visible_in_profile boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_custom_fields_org_key_unique unique (organization_id, key)
);

create index if not exists contact_custom_fields_org_idx
  on public.contact_custom_fields (organization_id, position);

comment on table public.contact_custom_fields is
  'Definições das variáveis personalizadas da organização (9013). O valor mora em contacts.custom_fields[key].';

drop trigger if exists trg_contact_custom_fields_touch on public.contact_custom_fields;
create trigger trg_contact_custom_fields_touch before update on public.contact_custom_fields
  for each row execute function public.fn_touch_updated_at();

alter table public.contact_custom_fields enable row level security;
-- Leitura: a organização. Escrita (inclusive DELETE): manager+. Uma policy
-- `for all` com o USING de membro deixaria o agent APAGAR linhas.
drop policy if exists tenant_isolation_contact_custom_fields_all on public.contact_custom_fields;
drop policy if exists contact_custom_fields_select on public.contact_custom_fields;
create policy contact_custom_fields_select on public.contact_custom_fields
  for select
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());
drop policy if exists contact_custom_fields_insert on public.contact_custom_fields;
create policy contact_custom_fields_insert on public.contact_custom_fields
  for insert
  with check (public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager')));
drop policy if exists contact_custom_fields_update on public.contact_custom_fields;
create policy contact_custom_fields_update on public.contact_custom_fields
  for update
  using (public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager')))
  with check (public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager')));
drop policy if exists contact_custom_fields_delete on public.contact_custom_fields;
create policy contact_custom_fields_delete on public.contact_custom_fields
  for delete
  using (public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager')));
revoke all on public.contact_custom_fields from anon;

notify pgrst, 'reload schema';
