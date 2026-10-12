-- ---- cota da campanha e verificação de WhatsApp (migration 9020) ----
-- 9020 (fork jhoow, Campanhas):
--
--  - `campaigns.cota_quantidade` + `cota_periodo` (hora/dia/semana/mes):
--    "chamar 3 por dia". A rodada divide sozinha o período pela janela diária
--    (janela de 9 h e 3 por dia = um a cada ~3 h) e não passa da cota no
--    período corrente (no fuso da campanha). Os dois juntos ou nenhum.
--  - `wait_reason` ganha `cota_do_periodo` e `sem_whatsapp`.
--  - `contacts.wa_existe` / `wa_verificado_em`: o resultado (em cache) da
--    pergunta "este número tem WhatsApp?", feita ANTES da primeira mensagem a
--    quem nunca falou com a gente. Mandar para fixo ou número sem conta foi a
--    causa provável da suspensão de 06/10: o envio é recusado antes de sair.
-- Aditiva e reaplicável.

alter table public.campaigns add column if not exists cota_quantidade integer;
alter table public.campaigns add column if not exists cota_periodo text;

alter table public.campaigns drop constraint if exists campaigns_cota_check;
alter table public.campaigns add constraint campaigns_cota_check check (
  (cota_quantidade is null and cota_periodo is null)
  or (cota_quantidade is not null and cota_periodo is not null
      and cota_quantidade between 1 and 10000
      and cota_periodo in ('hora', 'dia', 'semana', 'mes'))
);

alter table public.campaigns drop constraint if exists campaigns_wait_reason_check;
alter table public.campaigns add constraint campaigns_wait_reason_check check (
  wait_reason is null or wait_reason in
    ('fora_da_janela', 'teto_diario', 'teto_horario', 'intervalo', 'intervalo_aleatorio', 'sem_numero_livre',
     'cota_do_periodo', 'sem_whatsapp')
);

alter table public.contacts add column if not exists wa_existe boolean;
alter table public.contacts add column if not exists wa_verificado_em timestamptz;

comment on column public.campaigns.cota_quantidade is
  'Quantos contatos a campanha chama por cota_periodo (9020). A rodada espaça os envios pela janela diária.';
comment on column public.contacts.wa_existe is
  'Este número tem WhatsApp? (9020) — verificado antes da 1ª mensagem; nulo = nunca verificado.';

notify pgrst, 'reload schema';
