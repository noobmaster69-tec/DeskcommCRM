-- ---- tradução automática (migration 9022) ----
-- 9022 (fork jhoow, Inbox › Tradução automática, Fase A): o idioma do contato
-- ganha ORIGEM (manual > DDI > detectado) e cache da detecção; cada mensagem
-- ganha as colunas do cache de tradução (nunca re-chamar o LLM para a mesma
-- mensagem); o atendente ganha o idioma em que opera; o fluxo ganha a chave
-- "traduzir para o idioma do contato". Aditiva e reaplicável.

-- 1. Contato: de onde veio o idioma, e o cache da detecção pelo texto.
alter table public.contacts add column if not exists locale_source text;
alter table public.contacts add column if not exists locale_detected text;
alter table public.contacts add column if not exists locale_detected_at timestamptz;
alter table public.contacts drop constraint if exists contacts_locale_source_check;
alter table public.contacts add constraint contacts_locale_source_check check (
  locale_source is null or locale_source in ('manual', 'ddi', 'detected')
);
comment on column public.contacts.locale_source is
  'De onde veio contacts.locale (9022): manual (alguém escolheu — sempre vence), ddi (código do país do telefone) ou detected (LLM na última mensagem recebida).';
comment on column public.contacts.locale_detected is
  'Cache da detecção de idioma pelo texto (9022). Lido antes de chamar o LLM de novo.';

-- 2. Mensagem: o cache de tradução.
alter table public.messages add column if not exists content_original text;
alter table public.messages add column if not exists content_locale text;
alter table public.messages add column if not exists content_translated text;
alter table public.messages add column if not exists translated_to text;
alter table public.messages add column if not exists translated_at timestamptz;
alter table public.messages add column if not exists translation_status text;
alter table public.messages drop constraint if exists messages_translation_status_check;
alter table public.messages add constraint messages_translation_status_check check (
  translation_status is null or translation_status in ('pending', 'done', 'failed', 'skipped')
);
comment on column public.messages.content_original is
  'Saída traduzida (9022): o texto que o atendente escreveu, no idioma dele. body = o que foi enviado.';
comment on column public.messages.content_translated is
  'Entrada traduzida (9022): body no idioma do atendente (translated_to). Cache — nunca re-traduzir a mesma mensagem para o mesmo idioma.';

-- 3. Atendente: o idioma em que opera (padrão pt-BR). Tabela própria porque o
-- worker precisa ler em lote, sem passar pela API de auth.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  operating_locale text not null default 'pt-BR',
  updated_at timestamptz not null default now()
);
alter table public.user_preferences drop constraint if exists user_preferences_operating_locale_check;
alter table public.user_preferences add constraint user_preferences_operating_locale_check check (
  operating_locale ~ '^[a-z]{2}(-[A-Z]{2})?$'
);
alter table public.user_preferences enable row level security;
drop policy if exists user_preferences_self_select on public.user_preferences;
create policy user_preferences_self_select on public.user_preferences
  for select to authenticated using (user_id = auth.uid());
drop policy if exists user_preferences_self_insert on public.user_preferences;
create policy user_preferences_self_insert on public.user_preferences
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists user_preferences_self_update on public.user_preferences;
create policy user_preferences_self_update on public.user_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.user_preferences from anon;
grant select, insert, update on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;
comment on table public.user_preferences is
  'Preferências do atendente (9022). operating_locale: o idioma em que ele lê e escreve no Inbox.';

-- 4. Fluxo: traduzir as mensagens para o idioma do contato ao enviar (padrão: não).
alter table public.followup_flow_pointers
  add column if not exists translate_to_contact_locale boolean not null default false;
comment on column public.followup_flow_pointers.translate_to_contact_locale is
  'Traduzir os blocos Mensagem para o idioma do contato antes do envio (9022).';

-- 5. Consumo: a tradução e a detecção entram no registro de chamadas de IA.
alter table public.ai_invocations drop constraint if exists ai_invocations_invocation_kind_check;
alter table public.ai_invocations add constraint ai_invocations_invocation_kind_check check (
  invocation_kind = any (array['bot_respond', 'sentiment_classify', 'triage_classify', 'embedding_generate', 'message_translate', 'locale_detect'])
);

notify pgrst, 'reload schema';
