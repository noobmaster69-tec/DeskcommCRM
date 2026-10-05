-- ---- fonte do público da campanha (migration 9017) ----
-- 9017 (fork jhoow, Campanhas › item 1) — a "Fonte do público" ganha nome e
-- quatro modos: Do CRM, Por etiqueta, Importar lista, Consulta. Os modos CRM e
-- etiqueta continuam sendo o FILTRO de `campaigns.audience_filter`; esta tabela
-- guarda o que o filtro não guarda: a LISTA IMPORTADA de uma planilha.
--
--  - `campaign_audience_sources`: uma importação (ou o registro de uma fonte).
--    `contact_ids` = os contatos que a planilha virou (criados ou achados no
--    CRM) — é a audiência do modo importação, e o filtro aponta para a linha
--    (`audience_filter.lista_importada`). `config` guarda o mapeamento das
--    colunas, as opções escolhidas e as contagens (auditoria). `campaign_id`
--    nasce nulo: a planilha sobe ANTES de a campanha ser salva, e a campanha se
--    liga a ela ao salvar.
--  - Bucket privado `campaign-audiences`: o ARQUIVO original, para auditoria
--    ("de onde saiu essa lista?"). Só o servidor lê e escreve (service role);
--    nenhuma policy de storage para `authenticated`.
--
-- RLS: a organização lê, manager+ escreve. Aditiva e reaplicável.

create table if not exists public.campaign_audience_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid,
  mode text not null check (mode in ('crm', 'tag', 'import', 'query')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  contact_ids uuid[] not null default '{}'::uuid[],
  snapshot_file_path text check (snapshot_file_path is null or length(snapshot_file_path) <= 500),
  estimated_recipients integer not null default 0 check (estimated_recipients >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_audience_sources_org_id_key unique (organization_id, id)
);

alter table public.campaign_audience_sources drop constraint if exists campaign_audience_sources_campaign_fkey;
alter table public.campaign_audience_sources
  add constraint campaign_audience_sources_campaign_fkey
  foreign key (campaign_id) references public.campaigns(id) on delete cascade;

create index if not exists campaign_audience_sources_org_idx
  on public.campaign_audience_sources (organization_id, created_at desc);
create index if not exists campaign_audience_sources_campaign_idx
  on public.campaign_audience_sources (campaign_id) where campaign_id is not null;

comment on table public.campaign_audience_sources is
  'Fonte do público de campanha (9017): a lista importada de planilha (contact_ids + arquivo original no bucket campaign-audiences).';

drop trigger if exists trg_campaign_audience_sources_touch on public.campaign_audience_sources;
create trigger trg_campaign_audience_sources_touch before update on public.campaign_audience_sources
  for each row execute function public.fn_touch_updated_at();

alter table public.campaign_audience_sources enable row level security;
drop policy if exists tenant_isolation_campaign_audience_sources_all on public.campaign_audience_sources;
create policy tenant_isolation_campaign_audience_sources_all on public.campaign_audience_sources
  for all
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
  with check (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager'))
  );
revoke all on public.campaign_audience_sources from anon;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'campaign-audiences',
  'campaign-audiences',
  false,
  10485760,
  array[
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
