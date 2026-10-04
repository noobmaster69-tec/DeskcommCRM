-- ---- cor do funil (migration 9008) ----
-- 9008 (fork jhoow, Funis no modelo Kommo, Fase C) — a "cor da aba" de cada
-- funil: a bolinha que aparece ao lado do nome no seletor de funis do quadro e
-- na lista de "Gerenciar funis". Mesmo formato da cor da etapa
-- (`crm_stages_color_format`): hex de 6 dígitos ou nulo = sem cor.
--
-- Aditiva e reaplicável: coluna nullable, sem backfill (funil antigo fica sem
-- cor, que é a verdade sobre ele); o CHECK é recriado por nome.

alter table public.crm_pipelines
  add column if not exists color text;

comment on column public.crm_pipelines.color is
  'Cor do funil no seletor do quadro (9008): hex #rrggbb ou nulo = sem cor.';

alter table public.crm_pipelines drop constraint if exists crm_pipelines_color_format;
alter table public.crm_pipelines add constraint crm_pipelines_color_format
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

notify pgrst, 'reload schema';
