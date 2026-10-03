-- ---- menu: a porta "Funis" (/app/kanban) vira "CRMs" (/app/crms) (migration 9005) ----
-- 9005 (fork jhoow, CRMs, Fase B) — o item do grupo CRM no menu passou a ser a
-- grade de CRMs, em `/app/crms`. No catálogo de navegação o `href` é também o
-- IDENTIFICADOR do item, e três lugares o guardam como dado:
--   * `user_organizations.menu_oculto`      — o que a pessoa escondeu do menu (9001);
--   * `user_organizations.interface_settings.destinos` — a interface do vínculo;
--   * `organizations.interface_settings.destinos`      — a interface da empresa.
-- Sem esta reescrita, quem escondeu "Funis" veria "CRMs" aparecer de volta, e
-- uma interface simplificada perderia a porta do funil: o leitor descarta id que
-- o catálogo não conhece, em silêncio.
--
-- Reaplicável: só toca linha que ainda cita `/app/kanban`. Não duplica — se a
-- lista já tinha `/app/crms`, sobra um — e preserva a ordem do resto.

update public.user_organizations uo
   set menu_oculto = (
     select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
       from (
         select distinct on (item) item, ord
           from (
             select case when e #>> '{}' = '/app/kanban' then to_jsonb('/app/crms'::text) else e end as item, ord
               from jsonb_array_elements(uo.menu_oculto) with ordinality as t(e, ord)
           ) trocados
          order by item, ord
       ) unicos
   )
 where uo.menu_oculto @> '["/app/kanban"]'::jsonb;

update public.user_organizations uo
   set interface_settings = jsonb_set(
     uo.interface_settings,
     '{destinos}',
     (
       select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
         from (
           select distinct on (item) item, ord
             from (
               select case when e #>> '{}' = '/app/kanban' then to_jsonb('/app/crms'::text) else e end as item, ord
                 from jsonb_array_elements(uo.interface_settings->'destinos') with ordinality as t(e, ord)
             ) trocados
            order by item, ord
         ) unicos
     )
   )
 where jsonb_typeof(uo.interface_settings->'destinos') = 'array'
   and uo.interface_settings->'destinos' @> '["/app/kanban"]'::jsonb;

update public.organizations o
   set interface_settings = jsonb_set(
     o.interface_settings,
     '{destinos}',
     (
       select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
         from (
           select distinct on (item) item, ord
             from (
               select case when e #>> '{}' = '/app/kanban' then to_jsonb('/app/crms'::text) else e end as item, ord
                 from jsonb_array_elements(o.interface_settings->'destinos') with ordinality as t(e, ord)
             ) trocados
            order by item, ord
         ) unicos
     )
   )
 where jsonb_typeof(o.interface_settings->'destinos') = 'array'
   and o.interface_settings->'destinos' @> '["/app/kanban"]'::jsonb;
