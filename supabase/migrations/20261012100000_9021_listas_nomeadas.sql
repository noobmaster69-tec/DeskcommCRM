-- ---- listas nomeadas (migration 9021) ----
-- 9021 (fork jhoow, Operações › Listas): a lista importada (9017) ganha NOME e
-- vira cidadã de primeira classe — a aba Listas mostra todas (subidas lá ou na
-- campanha) e a campanha reaproveita qualquer uma. Mesma tabela: nada de
-- segunda fonte de verdade para "a planilha que virou contatos".
-- Aditiva e reaplicável.

alter table public.campaign_audience_sources add column if not exists name text;

alter table public.campaign_audience_sources drop constraint if exists campaign_audience_sources_name_check;
alter table public.campaign_audience_sources add constraint campaign_audience_sources_name_check check (
  name is null or length(btrim(name)) between 1 and 120
);

comment on column public.campaign_audience_sources.name is
  'Nome da lista (9021), mostrado em Operações › Listas e no "Usar uma lista salva" da campanha.';

notify pgrst, 'reload schema';
