-- ---- janela diária em minutos da campanha (migration 9018) ----
-- 9018 (fork jhoow, "Ritmo e Programação"): a janela diária da campanha em
-- HH:mm. Até aqui ela era só em horas inteiras (`janela_inicio_hora` /
-- `janela_fim_hora`, 0375).
--
--  - `janela_inicio_minuto` / `janela_fim_minuto`: minutos do dia, [início, fim).
--    Quando preenchidos, mandam; senão vale a janela em horas, como antes
--    (campanhas existentes não mudam de comportamento).
--  - `wait_reason` / `wait_until`: o MOTIVO REAL da última espera da rodada
--    (fora_da_janela, teto_diario, teto_horario, intervalo, sem_numero_livre)
--    e até quando. A tela diz "não enviou porque…" em vez de adivinhar.
--    Limpos no envio seguinte.
--  - O INÍCIO da campanha (o evento "03/12/2026 às 12:00") continua em
--    `scheduled_at` (UTC) + `timezone` (9015). A janela é a restrição que se
--    repete todo dia; não se confundem.
-- Aditiva e reaplicável.

alter table public.campaigns add column if not exists janela_inicio_minuto integer;
alter table public.campaigns add column if not exists janela_fim_minuto integer;

alter table public.campaigns add column if not exists wait_reason text;
alter table public.campaigns add column if not exists wait_until timestamptz;

alter table public.campaigns drop constraint if exists campaigns_wait_reason_check;
alter table public.campaigns add constraint campaigns_wait_reason_check check (
  wait_reason is null or wait_reason in
    ('fora_da_janela', 'teto_diario', 'teto_horario', 'intervalo', 'intervalo_aleatorio', 'sem_numero_livre')
);

alter table public.campaigns drop constraint if exists campaigns_janela_em_minutos_check;
alter table public.campaigns add constraint campaigns_janela_em_minutos_check check (
  (janela_inicio_minuto is null and janela_fim_minuto is null)
  -- `is not null` explícito: `null between` dá NULL, e CHECK com NULL PASSA.
  or (janela_inicio_minuto is not null and janela_fim_minuto is not null
      and janela_inicio_minuto between 0 and 1439
      and janela_fim_minuto between 1 and 1440
      and janela_fim_minuto > janela_inicio_minuto)
);

comment on column public.campaigns.janela_inicio_minuto is
  'Início da janela diária de envio em minutos do dia (9018). Nulo = vale janela_inicio_hora.';
comment on column public.campaigns.janela_fim_minuto is
  'Fim (exclusivo) da janela diária de envio em minutos do dia (9018). Nulo = vale janela_fim_hora.';

notify pgrst, 'reload schema';
