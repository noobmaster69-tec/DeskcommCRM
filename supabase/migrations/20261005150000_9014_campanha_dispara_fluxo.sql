-- ---- campanha que dispara fluxo (migration 9014) ----
-- 9014 (fork jhoow, Campanhas › item 4) — a campanha pode, em vez de mandar
-- um texto, COLOCAR cada contato num fluxo publicado (Fluxos): a campanha cuida
-- de QUEM e QUANDO (público, ritmo, janela, rodízio); o fluxo conduz o resto.
--
--  - `mode`: 'text' (o de sempre) ou 'flow'. Default 'text' — toda campanha
--    existente segue igual.
--  - `flow_id`: o fluxo (surface 'fluxo'). FK composta (mesma organização) com
--    `on delete set null`: apagar o fluxo não apaga a campanha — ela para no
--    próximo envio com o motivo (a rodada confere).
-- A exigência "modo fluxo precisa de fluxo" é da API e da ação de preparar,
-- não CHECK: o `set null` do FK violaria um CHECK e a exclusão do fluxo falharia.
-- Aditiva e reaplicável.

alter table public.campaigns
  add column if not exists mode text not null default 'text';
alter table public.campaigns drop constraint if exists campaigns_mode_check;
alter table public.campaigns add constraint campaigns_mode_check check (mode in ('text', 'flow'));

alter table public.campaigns
  add column if not exists flow_id uuid;
alter table public.campaigns drop constraint if exists campaigns_flow_fkey;
alter table public.campaigns
  add constraint campaigns_flow_fkey
  foreign key (organization_id, flow_id)
  references public.followup_flow_pointers (organization_id, id)
  on delete set null (flow_id);

comment on column public.campaigns.mode is
  'O que a campanha faz com cada contato (9014): text = manda message_body; flow = inscreve no fluxo flow_id.';

notify pgrst, 'reload schema';
