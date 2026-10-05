-- ---- ritmo aleatório e fuso da campanha (migration 9015) ----
-- 9015 (fork jhoow, Campanhas › item 7):
--
--  - `min_interval_seconds` / `max_interval_seconds` (60 / 180 por padrão):
--    cada envio espera um tempo SORTEADO entre os dois. Intervalo fixo é
--    cadência de robô — o que a detecção de automação do WhatsApp procura.
--  - `next_send_at`: o instante sorteado do próximo envio, gravado pela rodada
--    depois de cada envio. Nulo = pode mandar já.
--  - `timezone`: o fuso da JANELA desta campanha (IANA, ex. Europe/Lisbon).
--    Nulo = o fuso do número (Conexões › Proteção de envio), como antes. A
--    validade do nome é conferida pela API (Intl); aqui só o formato.
--
-- O antigo `intervalo_segundos` (fixo) continua valendo como piso: o efetivo é
-- sempre o mais restritivo. Campanhas existentes ganham 60–180s — só ficam mais
-- devagar, nunca mais rápido.
-- Aditiva e reaplicável.

alter table public.campaigns add column if not exists min_interval_seconds integer not null default 60;
alter table public.campaigns add column if not exists max_interval_seconds integer not null default 180;
alter table public.campaigns add column if not exists next_send_at timestamptz;
alter table public.campaigns add column if not exists timezone text;

alter table public.campaigns drop constraint if exists campaigns_intervalo_aleatorio_check;
alter table public.campaigns add constraint campaigns_intervalo_aleatorio_check check (
  min_interval_seconds between 10 and 86400
  and max_interval_seconds between 10 and 86400
  and max_interval_seconds >= min_interval_seconds
);
alter table public.campaigns drop constraint if exists campaigns_timezone_check;
alter table public.campaigns add constraint campaigns_timezone_check check (
  timezone is null or timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'
);

comment on column public.campaigns.timezone is
  'Fuso da janela de envio desta campanha (9015, IANA). Nulo = o fuso do número.';

notify pgrst, 'reload schema';
