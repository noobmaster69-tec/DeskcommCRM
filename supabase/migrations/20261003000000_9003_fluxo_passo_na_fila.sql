-- ---- fluxos: o passo do fluxo na fila do worker (migration 9003) ----
-- 9003 (fork jhoow, Etapa 2, Fase B) — os fluxos rodam NA HORA, pelo worker que
-- já drena a `job_queue` continuamente, e não pelo relógio de minuto do
-- follow-up. Cada passo é um job `fluxo_step` (payload: enrollment e motivo); as
-- esperas (tempo máximo do Aguardar resposta, buffer) são o mesmo job com
-- `run_after` no futuro. Por isso o fluxo nunca é reclamado pelo relógio: o
-- enrollment dele fica com `next_eval_at = 'infinity'`.
--
-- Só vocabulário: `fluxo_step` entra nos dois CHECKs da fila — o de tipo e o de
-- coerência "turno precisa de contato" (todo passo de fluxo é de um contato).
-- No `baseline.sql` as duas constraints moram no seu BLOCO ÚNICO (o da 0226),
-- que já lista o tipo novo; aqui elas são refeitas inteiras para a cadeia.
alter table public.job_queue drop constraint if exists job_queue_kind_check;
alter table public.job_queue add constraint job_queue_kind_check
  check (kind in ('inbound_turn','followup_turn','watchdog','flywheel','case_reply_turn','operator_turn','transactional_delivery','approved_reply','fluxo_step'));

alter table public.job_queue drop constraint if exists job_queue_turn_needs_contact;
alter table public.job_queue add constraint job_queue_turn_needs_contact
  check ((kind in ('inbound_turn','followup_turn','case_reply_turn','operator_turn','transactional_delivery','approved_reply','fluxo_step')) = (contact_id is not null));

notify pgrst, 'reload schema';
