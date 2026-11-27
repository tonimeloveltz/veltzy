# SPEC: Eventos, aviso de data alterada

> SPEC mãe: `specs/eventos/SPEC.md` (bloco f, automações) e `hub/specs/eventos/SPEC.md`
> Migration base: `hub/supabase/migrations/20261116100146_veltzy_eventos_fase1.sql`
> Status: implementado em 27/11/2026 (sem commit), migration ainda não aplicada no staging

<!-- arquivos -->
- `hub/supabase/migrations/20261127094832_veltzy_eventos_aviso_data.sql` (novo, no Hub)
- `supabase/functions/_shared/events/render.ts` + `render.test.ts`
- `supabase/functions/_shared/events/dispatch.ts` + `dispatch.test.ts`
- `src/types/events.ts`
- `src/lib/events/render-message.ts` + teste espelhado
- `src/lib/events/editor-form.ts` + `editor-form.test.ts`
- `src/components/events/editor/pipeline/messages-section.tsx`, `message-card.tsx`
- `src/hooks/events/use-event-editor.ts` e um componente novo de confirmação no editor
<!-- /arquivos -->

## Problema

Hoje, mudar o início de um evento publicado reprograma o lembrete D-1 e mais nada. Quem já se inscreveu não fica sabendo: a confirmação recebida e o evento salvo na agenda continuam com a data antiga, e se o lembrete já saiu ele não sai de novo (índice `event_messages_once`).

## Regra

1. **Quando dispara:** o **dia** do `starts_at` muda (no fuso do evento) num evento `published` ou `closed`, não apagado, com início antigo e novo preenchidos, início novo no futuro e o aviso ligado. Rascunho, encerrado e cancelado não avisam.
2. **Quem recebe:** inscrições `registered` e `confirmed`. Cancelada, ausente e presente não recebem.
3. **Espera de 10 minutos:** o aviso entra na fila com `scheduled_for = now() + 10 min`. Outro Salvar com início diferente dentro da espera só empurra o horário. Assim, quem errou e corrigiu a data manda um aviso só, já com a data final.
4. **Data de referência:** cada aviso guarda em `ref_starts_at` o início que o inscrito conhecia (o antigo da primeira mudança). Se o organizador voltar para esse dia antes do envio, o aviso é cancelado.
5. **Texto renderizado na hora do envio**, como as outras mensagens, então sai sempre com a data atual. Variáveis novas: `{{data_anterior}}` e `{{hora_anterior}}`, montadas de `ref_starts_at` no fuso do evento.
6. **Mudou de novo depois do envio:** sai outro aviso. Não há limite de avisos por inscrição, só de um em fila por vez.
7. **Lembrete D-1:** se o novo início cair dentro das próximas 24 h, o lembrete espera o aviso da mesma inscrição sair e entra no tick seguinte. O inscrito recebe primeiro "mudou de data" e depois "amanhã tem", nunca o contrário.
8. **Início movido para o passado, evento fora do ar ou aviso desligado:** aviso pendente vira `canceled`.
9. **Mensagem transacional:** como a confirmação e o lembrete, não depende do consentimento de marketing. O SAIR (`marketing_opt_out`) continua barrando, pela regra 2 do `decideMessageAction`.
10. **Só o dia do início conta.** Mudar só a hora no mesmo dia, ou só o fim, não avisa (decisão da Leticia, 27/11/2026). A hora nova aparece no aviso se o dia também mudar, porque o texto é montado no envio.

## LGPD

Nenhum dado pessoal novo. O aviso informa uma mudança no serviço em que a pessoa se inscreveu, com a mesma base legal da confirmação e do lembrete (execução de contrato, art. 7º, V), e respeita o descadastro. `ref_starts_at` é dado do evento, não da pessoa. RLS de `event_messages` segue a da fase 1, sem mudança.

## Bloco 1: migration no Hub

Arquivo novo `hub/supabase/migrations/20261127094832_veltzy_eventos_aviso_data.sql`. Validado em 26/11: libpg-query 18.3 (11 comandos, 2 funções PL/pgSQL), regex do `supabase_lint_migrations.py` (o `DELETE FROM` que já existia no trigger leva `ci:allow-destructive`), sem BEGIN/COMMIT.

O que faz:
- `event_messages.kind` aceita `date_change` (CHECK recriado).
- Coluna `event_messages.ref_starts_at timestamptz` (nula fora do `date_change`).
- `event_messages_once` recriado sem o `date_change`; índice único novo `event_messages_date_change_queued` (uma por inscrição em `pending` ou `sending`). O `sending` entra porque o tick devolve mensagem presa em `sending` para `pending`, e sem ele as duas colidiriam e derrubariam o tick inteiro.
- Default de `events.messages` ganha `date_change` ligado; eventos existentes ganham a chave por `UPDATE ... WHERE NOT (messages ? 'date_change')`, ligada (ver pendência 2).
- `events_on_starts_at_change` reescrita com as regras 1, 3, 4 e 8 (mantém o DELETE do lembrete pendente).
- `events_scheduler_tick` reescrita só no passo 2: o lembrete não entra para inscrição com `date_change` em `pending`/`sending` (regra 7). Os passos 1, 3 e 4 ficam idênticos.

```sql
-- =====================================================================
-- Eventos: aviso de data alterada (kind 'date_change').
-- Spec: veltzy/specs/eventos/SPEC-aviso-data-alterada.md
-- Mudar o DIA do inicio (no fuso do evento) de evento publicado ou fechado enfileira
-- um aviso por inscrito ativo, com 10 min de espera: novo save dentro da espera so
-- empurra o horario, e voltar para o dia que o inscrito conhecia cancela o aviso.
-- Mudar so a hora no mesmo dia nao avisa (decisao da Leticia, 27/11/2026).
-- Sem BEGIN/COMMIT (o CLI ja envolve a migration numa transacao).
-- ci:allow-destructive a funcao de trigger reescrita mantem o DELETE do lembrete pendente (ja existia na 20261116100146)
-- =====================================================================

-- 1. Novo tipo de mensagem.
ALTER TABLE veltzy.event_messages DROP CONSTRAINT IF EXISTS event_messages_kind_check;
ALTER TABLE veltzy.event_messages ADD CONSTRAINT event_messages_kind_check CHECK (kind IN (
  'confirmation','reminder_d1','post_present','post_absent','cancel_notice','duplicate_resend','date_change'));

-- 2. Data que o inscrito conhecia quando o aviso nasceu (vira {{data_anterior}} e {{hora_anterior}}).
ALTER TABLE veltzy.event_messages ADD COLUMN IF NOT EXISTS ref_starts_at timestamptz;
COMMENT ON COLUMN veltzy.event_messages.ref_starts_at IS
  'So em date_change: inicio que o inscrito conhecia antes da mudanca. Mesmo dia do inicio atual = aviso cancelado.';

-- 3. Idempotencia: date_change pode sair varias vezes (cada mudanca), mas so um em fila por inscricao.
--    'sending' entra no indice: o tick devolve 'sending' preso para 'pending' e nao pode colidir.
DROP INDEX IF EXISTS veltzy.event_messages_once;
CREATE UNIQUE INDEX event_messages_once
  ON veltzy.event_messages (registration_id,
    (CASE WHEN kind IN ('post_present','post_absent') THEN 'post' ELSE kind END))
  WHERE kind NOT IN ('duplicate_resend','date_change');
CREATE UNIQUE INDEX IF NOT EXISTS event_messages_date_change_queued
  ON veltzy.event_messages (registration_id)
  WHERE kind = 'date_change' AND status IN ('pending','sending');

-- 4. Texto padrao: eventos novos nascem com o aviso ligado.
ALTER TABLE veltzy.events ALTER COLUMN messages SET DEFAULT jsonb_build_object(
  'confirmation',  jsonb_build_object('enabled', true,  'text',
    E'Oi, {{primeiro_nome}}! Sua inscrição no {{evento}} está confirmada.\n📅 {{data}} às {{hora}}\n📍 {{local}}\nDetalhes e agenda: {{link_inscricao}}'),
  'reminder_d1',   jsonb_build_object('enabled', true,  'text',
    'Oi, {{primeiro_nome}}! Amanhã tem {{evento}}, às {{hora}}. Confirma sua presença aqui: {{link_confirmar}}'),
  'post_present',  jsonb_build_object('enabled', true,  'text',
    'Oi, {{primeiro_nome}}! Obrigado por participar do {{evento}}. Quer conversar sobre os próximos passos? É só responder esta mensagem.'),
  'post_absent',   jsonb_build_object('enabled', true,  'text',
    'Oi, {{primeiro_nome}}, sentimos sua falta no {{evento}}. Quer receber o material? É só responder esta mensagem.'),
  'cancel_notice', jsonb_build_object('enabled', false, 'text',
    'Oi, {{primeiro_nome}}. O {{evento}} foi cancelado. Desculpe o transtorno.'),
  'date_change',   jsonb_build_object('enabled', true,  'text',
    E'Oi, {{primeiro_nome}}! O {{evento}} mudou de data.\n📅 Agora: {{data}} às {{hora}} (antes: {{data_anterior}} às {{hora_anterior}})\n📍 {{local}}\nDetalhes e agenda: {{link_inscricao}}'));

-- 5. Eventos que ja existem ganham a chave (ligada), sem tocar nas outras mensagens.
UPDATE veltzy.events
SET messages = messages || jsonb_build_object('date_change', jsonb_build_object('enabled', true, 'text',
  E'Oi, {{primeiro_nome}}! O {{evento}} mudou de data.\n📅 Agora: {{data}} às {{hora}} (antes: {{data_anterior}} às {{hora_anterior}})\n📍 {{local}}\nDetalhes e agenda: {{link_inscricao}}'))
WHERE NOT (messages ? 'date_change');

-- 6. Trigger de mudanca do inicio: lembrete pendente sai (como antes) e o aviso entra
--    quando o dia muda. Dia sempre no fuso do evento (NEW.timezone).
CREATE OR REPLACE FUNCTION veltzy.events_on_starts_at_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_new_day date := (NEW.starts_at AT TIME ZONE NEW.timezone)::date;
BEGIN
  IF NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
    DELETE FROM veltzy.event_messages
    WHERE event_id = NEW.id AND kind = 'reminder_d1' AND status = 'pending';

    IF NEW.status IN ('published','closed') AND NEW.deleted_at IS NULL
       AND OLD.starts_at IS NOT NULL AND NEW.starts_at IS NOT NULL AND NEW.starts_at > now()
       AND veltzy._event_msg_enabled(NEW.messages, 'date_change') THEN
      IF (OLD.starts_at AT TIME ZONE NEW.timezone)::date <> v_new_day THEN
        -- aviso pendente: so empurra a espera; ref_starts_at fica (e a data que o inscrito conhece)
        UPDATE veltzy.event_messages SET scheduled_for = now() + interval '10 minutes'
        WHERE event_id = NEW.id AND kind = 'date_change' AND status = 'pending';

        INSERT INTO veltzy.event_messages (company_id, event_id, registration_id, kind, scheduled_for, ref_starts_at)
        SELECT r.company_id, r.event_id, r.id, 'date_change', now() + interval '10 minutes', OLD.starts_at
        FROM veltzy.event_registrations r
        WHERE r.event_id = NEW.id AND r.status IN ('registered','confirmed')
        ON CONFLICT DO NOTHING;
      END IF;

      -- voltou para o dia que o inscrito conhecia: nao ha o que avisar
      UPDATE veltzy.event_messages SET status = 'canceled'
      WHERE event_id = NEW.id AND kind = 'date_change' AND status = 'pending'
        AND (ref_starts_at AT TIME ZONE NEW.timezone)::date = v_new_day;
    ELSE
      -- inicio no passado, evento fora do ar ou aviso desligado: nada pendente sai
      UPDATE veltzy.event_messages SET status = 'canceled'
      WHERE event_id = NEW.id AND kind = 'date_change' AND status = 'pending';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 7. Lembrete D-1 espera o aviso pendente da mesma inscricao (aviso primeiro, lembrete no tick seguinte).
CREATE OR REPLACE FUNCTION veltzy.events_scheduler_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_closed integer; v_reminders integer; v_finished integer := 0; v_reset integer; e record;
BEGIN
  -- 1. Janela de inscricao vencida.
  UPDATE veltzy.events SET status = 'closed', closed_reason = 'deadline'
  WHERE status = 'published' AND deleted_at IS NULL AND now() >= coalesce(registration_closes_at, starts_at);
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- 2. Lembrete D-1, sempre a partir do starts_at atual; so para quem se inscreveu antes da marca de 24h
  --    e sem aviso de data pendente (o aviso sai antes).
  INSERT INTO veltzy.event_messages (company_id, event_id, registration_id, kind, scheduled_for)
  SELECT r.company_id, r.event_id, r.id, 'reminder_d1', now()
  FROM veltzy.event_registrations r JOIN veltzy.events ev ON ev.id = r.event_id
  WHERE ev.status IN ('published','closed') AND ev.deleted_at IS NULL
    AND veltzy._event_msg_enabled(ev.messages, 'reminder_d1')
    AND now() >= ev.starts_at - interval '24 hours' AND now() < ev.starts_at
    AND r.status IN ('registered','confirmed')
    AND r.created_at < ev.starts_at - interval '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM veltzy.event_messages m
      WHERE m.registration_id = r.id AND m.kind = 'date_change' AND m.status IN ('pending','sending'))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_reminders = ROW_COUNT;

  -- 3. Encerramento.
  FOR e IN SELECT id FROM veltzy.events
           WHERE status IN ('published','closed') AND deleted_at IS NULL AND ends_at <= now() LOOP
    PERFORM veltzy.finish_event(e.id);
    v_finished := v_finished + 1;
  END LOOP;

  -- 4. Mensagem presa em 'sending' (queda do dispatcher) volta para a fila.
  UPDATE veltzy.event_messages SET status = 'pending'
  WHERE status = 'sending' AND updated_at < now() - interval '10 minutes';
  GET DIAGNOSTICS v_reset = ROW_COUNT;

  RETURN jsonb_build_object('closed', v_closed, 'reminders', v_reminders, 'finished', v_finished, 'reset', v_reset);
END $$;
```

Aplicar no staging por `supabase db push` (relinkar antes, ver `refs-supabase-staging-prod`). Produção só junto com a promoção de Eventos.

## Bloco 2: envio (Edge Functions)

- `_shared/events/render.ts`: `EventMessageVars` ganha `data_anterior` e `hora_anterior`. Sem mudança no `renderEventMessage` (variável sem valor já vira vazio).
- `_shared/events/dispatch.ts`:
  - `MessageKind` ganha `date_change`; `QueuedMessage` ganha `ref_starts_at: string | null`, e o `claim_event_messages` já devolve a linha inteira.
  - `decideMessageAction`: `date_change` com `dateUnchanged` (mesmo dia de `ref_starts_at` e `starts_at`, por `isSameEventDay` no `render.ts`) ou evento fora de `published`/`closed` vira `canceled` (defesa da regra 4, caso a fila mude entre o trigger e o envio). O resto segue as regras que já existem: inscrição cancelada, evento cancelado, opt-out, mensagem desligada ou texto vazio, sem sessão, limite de 20/min.
  - Render: `data_anterior: formatEventDate(msg.ref_starts_at, event.timezone)`, `hora_anterior: formatEventTime(...)`.
- Testes Deno (`npx --yes deno test`): decisão do `date_change` (envia, cancela com data igual, opt-out barra, sem consentimento de marketing envia), render com as duas variáveis novas.

## Bloco 3: editor

- `src/types/events.ts`: `EventMessageKind` com `date_change`; `EventMessage.ref_starts_at`.
- `src/lib/events/render-message.ts`: mesmas variáveis do servidor (o arquivo é cópia espelhada). `MESSAGE_VARIABLES` não muda; as duas novas entram só no card do aviso.
- `src/lib/events/editor-form.ts`: `MESSAGE_KINDS` com `date_change`. No `eventToValues`, chave ausente (evento salvo antes da migration ou criado por SQL) vira o texto padrão ligado, igual ao default do banco. Teste cobrindo a chave ausente.
- `messages-section.tsx`: card novo depois do lembrete:
  - título "Aviso de mudança de data"
  - quando: "Se o início mudar depois de publicado, para quem está inscrito. Sai 10 minutos depois de salvar."
  - prévia com `data_anterior`/`hora_anterior` de exemplo (o início salvo do evento).
- `message-card.tsx`: prop opcional `extraVariables` para os botões de variável só deste card.
- **Confirmação ao salvar:** com o evento `published` ou `closed`, dia do `starts_at` alterado em relação ao salvo (`src/lib/events/date-change-notice.ts`, espelho do trigger), início novo no futuro, aviso ligado e pelo menos um inscrito ativo, o Salvar abre um `AlertDialog`: "N inscritos vão receber no WhatsApp o aviso da nova data em 10 minutos." Botões "Salvar e avisar" e "Voltar". A contagem usa `count: 'exact', head: true` (não lista linhas, ver `max-rows-trunca-em-silencio`). Com o aviso desligado, salva direto, sem diálogo.

## Critérios de aceite

| # | Critério | Como verificar | Resultado |
|---|---|---|---|
| 1 | Mudar o início de evento publicado com 2 inscritos ativos cria 2 `date_change` pendentes para daqui a 10 min | SQL em `event_messages` | |
| 2 | Dois Salvar seguidos com datas diferentes: continua um aviso por inscrito, horário empurrado, `ref_starts_at` igual ao primeiro início | SQL | |
| 3 | Voltar para o dia original antes do envio cancela o aviso | SQL | |
| 3b | Mudar só a hora no mesmo dia não cria aviso nem abre o diálogo | SQL + browser | |
| 4 | Aviso sai com data nova e anterior certas, no fuso do evento, e aparece no Inbox | celular da equipe (WAHA real, com OK da Leticia) | |
| 5 | Inscrito cancelado ou descadastrado (SAIR) não recebe | `event_messages.status` | |
| 6 | Rascunho, início movido para o passado e aviso desligado não enfileiram | SQL | |
| 7 | Início novo dentro de 24 h: aviso sai antes, lembrete no tick seguinte | `sent_at` das duas | |
| 8 | Evento antigo (sem a chave) mostra o card ligado com o texto padrão | browser | |
| 9 | Diálogo de confirmação com a contagem certa; sem inscritos ou com aviso desligado, não aparece | browser | |
| 10 | Tick continua rodando com um `date_change` preso em `sending` | SQL: forçar `sending` com `updated_at` antigo e criar mudança nova | |

PVO: `npx tsc -b`, `npm run build`, `npm run lint` (sem erro novo contra o merge-base da `develop`), `npm test`, `npx --yes deno test` nos `_shared/events`, diff revisado, teste no browser no staging.

## Fora do escopo

- Reenviar o lembrete D-1 que já saiu antes de um adiamento (o aviso de data cobre a informação; o "confirme presença" do novo dia fica para depois).
- Aviso de mudança de local ou de link online.
- Atualizar a nota de evento gravada no negócio na inscrição.

## Pendências para o Toni

1. ~~Mudança só do fim avisa?~~ Resolvido em 27/11: só o dia do início avisa.
2. **Ligar o aviso nos eventos que já existem?** Proposta: sim (a migration liga). A alternativa é chave desligada nos antigos e ligada só nos novos.
3. **Achado à parte:** o texto padrão do lembrete diz "Amanhã tem". Se o evento for movido para mais tarde no mesmo dia, o lembrete sai com "amanhã" errado. Proposta: texto padrão novo "Lembrete: {{evento}} é {{data}} às {{hora}}...", em outra Spec.

## Decisões tomadas (preencher durante a execução)

| Data | Decisão | Motivo |
|---|---|---|
| 27/11/2026 | Aviso só quando muda o dia do início; hora no mesmo dia não avisa | decisão da Leticia |
| 27/11/2026 | O diálogo de confirmação fica só no Salvar; "Criar pipeline" e "Publicar" não abrem | Publicar parte de rascunho (não avisa); criar pipeline com data alterada pendente é raro |
| 27/11/2026 | Falha ao contar os inscritos bloqueia o Salvar com toast, em vez de salvar sem avisar | salvar sem a confirmação mandaria WhatsApp sem a pessoa saber |
