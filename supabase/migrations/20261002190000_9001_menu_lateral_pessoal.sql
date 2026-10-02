-- ---- menu lateral pessoal: o que cada pessoa esconde do próprio menu (migration 9001) ----
-- 9001 (fork jhoow, P6) — Configurações › Aparência › Menu lateral. Cada pessoa,
-- em cada organização, escolhe telas e grupos que NÃO quer ver no menu. A faixa
-- 9xxx é do fork: a numeração do upstream (05xx) segue sem colisão nos merges.
--
-- Por que coluna nova e não `interface_settings`: aquele campo é a escolha do
-- ADMIN para o membro (o membro recebe 403 se tentar mudá-lo), e o menu é a
-- interseção das escolhas. A preferência pessoal é outra camada, que a própria
-- pessoa grava e que só ESCONDE — nunca mostra o que o papel, a empresa ou o
-- admin restringiram (quem filtra é `sidebarGroups`, depois de tudo isso).
--
-- `menu_oculto` é um array de strings: href de destino (`/app/radar`) ou
-- `grupo:<id>` (`grupo:ia`). Sem lista de valores no CHECK de propósito: o
-- catálogo vive no TypeScript (`lib/navigation/catalogo.ts`) e muda a cada tela
-- nova; valor desconhecido é só ignorado na leitura.
--
-- A gravação passa por `fn_definir_menu_oculto`: a policy de UPDATE de
-- `user_organizations` é de admin, e abrir UPDATE para o próprio membro
-- deixaria ele mudar o próprio `role`. A função escreve UMA coluna, na linha do
-- `auth.uid()`, na organização pedida — e valida o formato.
--
-- Reaplicável: `add column if not exists`, `drop constraint if exists` antes do
-- `add constraint` e `create or replace function`.
alter table public.user_organizations
  add column if not exists menu_oculto jsonb not null default '[]'::jsonb;

comment on column public.user_organizations.menu_oculto is
  'Preferência PESSOAL de menu: hrefs de destino e grupo:<id> que a pessoa escondeu. Só esconde; nunca amplia. Gravada por fn_definir_menu_oculto.';

alter table public.user_organizations
  drop constraint if exists user_organizations_menu_oculto_formato;

alter table public.user_organizations
  add constraint user_organizations_menu_oculto_formato
  check (jsonb_typeof(menu_oculto) = 'array' and jsonb_array_length(menu_oculto) <= 200);

create or replace function public.fn_definir_menu_oculto(p_organization_id uuid, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'nao_autenticado' using errcode = '42501';
  end if;
  if p_itens is null
     or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) > 200
     or exists (
       select 1 from jsonb_array_elements(p_itens) e
        where jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 200
     ) then
    raise exception 'menu_oculto_invalido' using errcode = '22023';
  end if;
  update public.user_organizations
     set menu_oculto = p_itens
   where organization_id = p_organization_id
     and user_id = auth.uid()
     and revoked_at is null
  returning id into v_id;
  if v_id is null then
    raise exception 'vinculo_nao_encontrado' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_id, 'menu_oculto', p_itens);
end;
$$;

revoke all on function public.fn_definir_menu_oculto(uuid, jsonb) from public, anon;
grant execute on function public.fn_definir_menu_oculto(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
