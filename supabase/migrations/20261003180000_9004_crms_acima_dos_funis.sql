-- ---- CRMs: o nível acima dos funis (migration 9004) ----
-- 9004 (fork jhoow, CRMs, Fase A) — a hierarquia passa a ser
-- Organização → CRMs → Funis → Etapas → Cards. Um CRM agrupa funis que
-- compartilham público ou marca ("PA Advogados - EUROPA", "Clientes Girly").
--
-- Tudo aditivo e reaplicável:
--  1. `crm_crms`, com RLS espelhada da de `crm_pipelines` (lê quem é da org,
--     escreve manager+);
--  2. `fn_crm_padrao_da_org`: devolve o CRM padrão da org, criando-o se faltar;
--  3. `crm_pipelines.crm_id` + gatilho que o PREENCHE com o padrão quando vem
--     nulo. ⚠️ O GATILHO É O QUE TORNA O NOT NULL SEGURO: há dezenas de lugares
--     que criam funil sem saber de CRM (tela, onboarding, MCP, importar fluxo,
--     `trg_seed_default_pipeline_for_org`, e a imagem ANTERIOR a esta migration,
--     que continua no ar até o deploy). Sem ele, todos quebrariam no dia da
--     aplicação;
--  4. backfill genérico — cada org com funil ganha UM CRM "PADRÃO" e todos os
--     funis dela entram nele (nada de agrupar por nome: valeria só para um tenant);
--  5. chave estrangeira COMPOSTA (organization_id, crm_id): um funil não aponta
--     para CRM de outra organização, por construção. `NO ACTION` e não
--     `RESTRICT`: os dois recusam apagar CRM com funil, mas o RESTRICT confere
--     NO MEIO da instrução e quebraria o `delete from organizations`, que leva
--     CRMs e funis na mesma cascata;
--  6. índices das métricas e `fn_crms_com_metricas` (security invoker: a RLS vale);
--  7. `fn_crm_duplicar`: copia CRM + funis vivos + etapas, sem negócio, numa
--     transação só.
--
-- O slug segue a régua de `crm_pipelines.slug` (minúsculo, sem barra): a tela
-- mostra "/padrao", o banco guarda "padrao".

-- 1. a tabela
create table if not exists public.crm_crms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  is_default boolean not null default false,
  avatar_bg_color text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_crms_org_id_key unique (organization_id, id),
  constraint crm_crms_name_len check (length(btrim(name)) between 1 and 80),
  constraint crm_crms_slug_format check (slug ~ '^[a-z0-9_-]{2,40}$'),
  constraint crm_crms_description_len check (description is null or length(description) <= 280),
  constraint crm_crms_avatar_hex check (avatar_bg_color is null or avatar_bg_color ~ '^#[0-9a-fA-F]{6}$'),
  -- O padrão é para onde vai todo funil criado sem CRM: arquivá-lo deixaria a
  -- org sem destino.
  constraint crm_crms_padrao_nao_arquiva check (not (is_default and archived_at is not null))
);

comment on table public.crm_crms is
  'CRM = grupo de funis com publico ou marca proprios (fork jhoow, 9004). '
  'Exatamente um padrao por organizacao: destino de todo funil criado sem crm_id.';

-- Arquivado continua ocupando o slug, como em `uniq_crm_pipelines_org_slug`.
create unique index if not exists uniq_crm_crms_org_slug
  on public.crm_crms (organization_id, slug);
create unique index if not exists uniq_crm_crms_org_default
  on public.crm_crms (organization_id) where (is_default = true);

drop trigger if exists trg_crm_crms_updated_at on public.crm_crms;
create trigger trg_crm_crms_updated_at
  before update on public.crm_crms
  for each row execute function public.fn_set_updated_at();

alter table public.crm_crms enable row level security;

drop policy if exists "crm_crms_select" on public.crm_crms;
drop policy if exists "crm_crms_manager_write" on public.crm_crms;

create policy "crm_crms_select" on public.crm_crms
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

create policy "crm_crms_manager_write" on public.crm_crms
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

-- 2. o CRM padrão da org (busca ou cria)
-- `security definer`: é chamada pelo gatilho do item 3, e quem cria funil pode
-- ser o seed de organização nova ou um papel sem escrita em `crm_crms`.
-- Não tem seletor além da org do PRÓPRIO funil, e não é alcançável pela REST.
create or replace function public.fn_crm_padrao_da_org(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.crm_crms
   where organization_id = p_org and is_default;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.crm_crms (organization_id, name, slug, is_default)
  values (
    p_org,
    'PADRÃO',
    case
      when exists (select 1 from public.crm_crms where organization_id = p_org and slug = 'padrao')
        then 'padrao-' || substr(md5(gen_random_uuid()::text), 1, 6)
      else 'padrao'
    end,
    true
  )
  on conflict do nothing
  returning id into v_id;

  -- Outra transação criou o padrão no mesmo instante: o índice único segurou,
  -- e o dela é o que vale.
  if v_id is null then
    select id into v_id from public.crm_crms
     where organization_id = p_org and is_default;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.fn_crm_padrao_da_org(uuid) from public, anon, authenticated;
grant execute on function public.fn_crm_padrao_da_org(uuid) to service_role;

-- 3. a coluna e o gatilho que a preenche
alter table public.crm_pipelines
  add column if not exists crm_id uuid;

comment on column public.crm_pipelines.crm_id is
  'CRM a que o funil pertence (9004). Nulo no INSERT/UPDATE = o CRM padrao da org, '
  'preenchido por trg_crm_pipelines_preencher_crm.';

create or replace function public.fn_crm_pipelines_preencher_crm()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.crm_id is null then
    new.crm_id := public.fn_crm_padrao_da_org(new.organization_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_crm_pipelines_preencher_crm() from public, anon, authenticated;

drop trigger if exists trg_crm_pipelines_preencher_crm on public.crm_pipelines;
create trigger trg_crm_pipelines_preencher_crm
  before insert or update of crm_id on public.crm_pipelines
  for each row execute function public.fn_crm_pipelines_preencher_crm();

-- 4. backfill (qualquer org, qualquer clone; reaplicar não acha linha nula)
update public.crm_pipelines p
   set crm_id = public.fn_crm_padrao_da_org(p.organization_id)
 where p.crm_id is null;

-- 5. mesma organização por construção + NOT NULL
alter table public.crm_pipelines
  drop constraint if exists crm_pipelines_crm_fkey;
alter table public.crm_pipelines
  add constraint crm_pipelines_crm_fkey
  foreign key (organization_id, crm_id)
  references public.crm_crms (organization_id, id);

alter table public.crm_pipelines
  alter column crm_id set not null;

-- 6. métricas dos cards
create index if not exists idx_crm_pipelines_crm
  on public.crm_pipelines (crm_id) where (is_archived = false);
create index if not exists idx_crm_leads_pipeline_updated
  on public.crm_leads (pipeline_id, updated_at desc);

-- `security invoker`: a RLS de crm_crms, crm_pipelines e crm_leads vale para
-- quem chama. `p_org` é recorte, não autorização — a rota o tira da sessão.
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
  select c.id, c.name, c.slug, c.description, c.is_default, c.avatar_bg_color,
         c.created_at, c.updated_at,
         coalesce(m.leads, 0), coalesce(m.funis, 0), m.ultimo
    from public.crm_crms c
    left join lateral (
      select count(distinct p.id) as funis,
             count(l.id) as leads,
             max(l.updated_at) as ultimo
        from public.crm_pipelines p
        left join public.crm_leads l
          on l.pipeline_id = p.id and l.organization_id = p_org
       where p.crm_id = c.id
         and p.organization_id = p_org
         and not p.is_archived
    ) m on true
   where c.organization_id = p_org
     and c.archived_at is null
   order by c.is_default desc, c.name asc
$$;

revoke execute on function public.fn_crms_com_metricas(uuid) from public, anon;
grant execute on function public.fn_crms_com_metricas(uuid) to authenticated, service_role;

-- 7. duplicar (estrutura, sem negócio)
-- `security invoker`: as policies manager+ de crm_crms, crm_pipelines e
-- crm_stages decidem. As linhas são copiadas por `jsonb_populate_record`, e não
-- por lista de colunas: coluna que um apêndice futuro acrescentar ao funil ou à
-- etapa vem junto, em vez de sumir da cópia em silêncio.
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
     order by position
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
     where s.pipeline_id = r.id and not s.is_archived;
  end loop;

  return v_novo;
end;
$$;

revoke execute on function public.fn_crm_duplicar(uuid, text, text) from public, anon;
grant execute on function public.fn_crm_duplicar(uuid, text, text) to authenticated, service_role;
