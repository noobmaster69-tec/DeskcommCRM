-- ---- etapa de quem recebe a campanha (migration 9016) ----
-- 9016 (fork jhoow, Campanhas › item 3) — o progresso da campanha no FUNIL:
--
--  - "Quem recebe" (NOVO): `recipients_pipeline_id` / `recipients_stage_id` —
--    ao ENVIAR, o contato ganha (ou move) o card nesta etapa.
--  - "Quem responde": é o `pipeline_id` / `stage_id` que a campanha JÁ tinha
--    (migration 0378, "vira card no funil" na resposta). Agora, além de nascer
--    ali, o card que já existia é MOVIDO para lá quando a pessoa responde.
--    Não criei `respondents_*`: seriam duas colunas para a mesma decisão.
--
-- FKs compostas (mesma organização) com `on delete set null` — arquivar/apagar
-- o funil não apaga a campanha. Aditiva e reaplicável.

alter table public.campaigns add column if not exists recipients_pipeline_id uuid;
alter table public.campaigns add column if not exists recipients_stage_id uuid;

alter table public.campaigns drop constraint if exists campaigns_recipients_pipeline_fkey;
alter table public.campaigns
  add constraint campaigns_recipients_pipeline_fkey
  foreign key (organization_id, recipients_pipeline_id)
  references public.crm_pipelines (organization_id, id)
  on delete set null (recipients_pipeline_id);

alter table public.campaigns drop constraint if exists campaigns_recipients_stage_fkey;
alter table public.campaigns
  add constraint campaigns_recipients_stage_fkey
  foreign key (organization_id, recipients_stage_id)
  references public.crm_stages (organization_id, id)
  on delete set null (recipients_stage_id);

comment on column public.campaigns.recipients_stage_id is
  'Etapa onde o contato entra quando a campanha ENVIA para ele (9016). A etapa de quem RESPONDE é stage_id (0378).';

notify pgrst, 'reload schema';
