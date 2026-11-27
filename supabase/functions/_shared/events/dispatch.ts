// Laco do dispatcher de mensagens de evento, usado por event-dispatcher e event-scheduler.
// A decisao por mensagem (decideMessageAction) e pura e testada; o resto e I/O.
//
// O envio NAO passa pelo whatsapp-send: ele escolhe o provider pelo contato
// (leads.whatsapp_provider), e um contato antigo de Cloud API iria pela Cloud API em vez
// da sessao WAHA do evento (PRD D12). Aqui o envio e sempre pela sessao do evento.

import type { PublicClient, VeltzyClient } from './clients.ts'
import { createProvider } from '../whatsapp-factory.ts'
import type { WhatsAppConfig } from '../whatsapp-provider.ts'
import { formatEventDate, formatEventLocation, formatEventTime, isSameEventDay, renderEventMessage } from './render.ts'
import { confirmUrl, registrationUrl } from './public-urls.ts'

export type MessageKind =
  | 'confirmation' | 'reminder_d1' | 'post_present' | 'post_absent' | 'cancel_notice' | 'duplicate_resend'
  | 'date_change'

export const SESSION_RATE_LIMIT = 20 // envios 'sent' por sessao a cada 60 s

export interface DecisionInput {
  kind: MessageKind
  registrationStatus: string
  eventStatus: string
  /** messages jsonb do evento */
  messages: Record<string, { enabled?: boolean; text?: string } | undefined>
  leadOptOut: boolean
  consentMarketing: boolean
  /** registro marketing_consent_id revogado (revogado_em preenchido) */
  marketingConsentRevoked: boolean
  sessionName: string | null
  sessionConnected: boolean
  sentLastMinute: number
  /** date_change: o inicio atual cai no mesmo dia que o inscrito ja conhecia (ref_starts_at) */
  dateUnchanged?: boolean
}

export type Decision =
  | { action: 'canceled' | 'skipped_opt_out' | 'skipped_no_consent' | 'skipped_no_instance' | 'deferred'; kind: MessageKind }
  | { action: 'send'; kind: MessageKind; template: string }

/** Texto e chave de config de cada tipo: o reenvio por duplicidade usa a confirmacao. */
const configKey = (kind: MessageKind) => (kind === 'duplicate_resend' ? 'confirmation' : kind)

export function decideMessageAction(i: DecisionInput): Decision {
  let kind = i.kind

  // 1. inscricao cancelada, ou evento cancelado e nao e o aviso de cancelamento
  if (i.registrationStatus === 'canceled' || (i.eventStatus === 'canceled' && kind !== 'cancel_notice')) {
    return { action: 'canceled', kind }
  }
  // aviso de data: evento fora do ar, ou o dia voltou ao que o inscrito ja conhecia
  if (kind === 'date_change' && (!['published', 'closed'].includes(i.eventStatus) || i.dateUnchanged)) {
    return { action: 'canceled', kind }
  }
  // 2. descadastrado (SAIR) nao recebe nada, nem transacional
  if (i.leadOptOut) return { action: 'skipped_opt_out', kind }

  // 3. pos-evento: tipo pelo status atual e so com consentimento de marketing ativo
  if (kind === 'post_present' || kind === 'post_absent') {
    if (i.registrationStatus === 'attended') kind = 'post_present'
    else if (i.registrationStatus === 'absent') kind = 'post_absent'
    else return { action: 'canceled', kind }
    if (!i.consentMarketing || i.marketingConsentRevoked) return { action: 'skipped_no_consent', kind }
  }

  // mensagem desligada (ou sem texto) depois de enfileirada
  const cfg = i.messages[configKey(kind)]
  if (!cfg?.enabled || !(cfg.text ?? '').trim()) return { action: 'canceled', kind }

  // 4. sem sessao WAHA conectada
  if (!i.sessionName || !i.sessionConnected) return { action: 'skipped_no_instance', kind }

  // 5. limite por sessao
  if (i.sentLastMinute >= SESSION_RATE_LIMIT) return { action: 'deferred', kind }

  return { action: 'send', kind, template: cfg.text as string }
}

export interface DispatchOptions {
  messageId?: string | null
  /** orcamento total em ms; o que sobrar volta para a fila como 'deferred' */
  budgetMs: number
  batchSize?: number
  /** espera entre envios da mesma sessao (injetavel no teste) */
  sleep?: (ms: number) => Promise<void>
}

export interface DispatchSummary {
  processed: number
  sent: number
  failed: number
  skipped: number
  deferred: number
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const randomGap = () => 2000 + Math.floor(Math.random() * 3000) // 2 a 5 s

interface QueuedMessage {
  id: string
  company_id: string
  event_id: string
  registration_id: string
  kind: MessageKind
  /** so em date_change: inicio que o inscrito conhecia */
  ref_starts_at: string | null
}

interface RegRow {
  id: string
  status: string
  first_name: string
  public_token: string
  whatsapp: string
  lead_id: string | null
  consent_marketing: boolean
  marketing_consent_id: string | null
}

interface EventRow {
  id: string
  company_id: string
  slug: string
  title: string
  status: string
  format: 'presencial' | 'online' | 'hibrido'
  starts_at: string | null
  timezone: string
  venue_name: string | null
  street: string | null
  number: string | null
  district: string | null
  city: string | null
  state: string | null
  online_url: string | null
  messages: DecisionInput['messages'] | null
  whatsapp_session_name: string | null
}

interface LeadRow {
  id: string
  phone: string | null
  marketing_opt_out: boolean | null
}

interface Loaded {
  reg: RegRow
  event: EventRow
  lead: LeadRow | null
  consentRevoked: boolean
}

async function loadContext(veltzy: VeltzyClient, msg: QueuedMessage): Promise<Loaded | null> {
  const { data: reg } = await veltzy
    .from('event_registrations')
    .select('id, status, first_name, public_token, whatsapp, lead_id, consent_marketing, marketing_consent_id')
    .eq('id', msg.registration_id)
    .maybeSingle()
  if (!reg) return null
  const { data: event } = await veltzy
    .from('events')
    .select('id, company_id, slug, title, status, format, starts_at, timezone, venue_name, street, number, district, city, state, online_url, messages, whatsapp_session_name')
    .eq('id', msg.event_id)
    .eq('company_id', msg.company_id)
    .maybeSingle()
  if (!event) return null
  const { data: lead } = reg.lead_id
    ? await veltzy.from('leads').select('id, phone, marketing_opt_out').eq('id', reg.lead_id).maybeSingle()
    : { data: null }
  let consentRevoked = false
  if (reg.marketing_consent_id) {
    const { data: consent } = await veltzy
      .from('lead_consents').select('revogado_em').eq('id', reg.marketing_consent_id).maybeSingle()
    consentRevoked = !consent || consent.revogado_em !== null
  }
  return { reg: reg as RegRow, event: event as EventRow, lead: lead as LeadRow | null, consentRevoked }
}

/**
 * Processa a fila: claim (SKIP LOCKED) em lotes ate esvaziar ou estourar o orcamento.
 * `veltzy` e `pub` sao clientes service_role (schema veltzy e public).
 */
export async function runDispatch(
  veltzy: VeltzyClient,
  pub: PublicClient,
  opts: DispatchOptions,
): Promise<DispatchSummary> {
  const started = Date.now()
  const sleep = opts.sleep ?? defaultSleep
  const summary: DispatchSummary = { processed: 0, sent: 0, failed: 0, skipped: 0, deferred: 0 }
  const sessionStatus = new Map<string, boolean>()
  const sentLocal = new Map<string, number[]>() // timestamps de envio por sessao nesta execucao
  const lastSendAt = new Map<string, number>()
  const outOfTime = () => Date.now() - started > opts.budgetMs

  const complete = async (id: string, status: string, extra: Record<string, unknown> = {}) => {
    await veltzy.rpc('complete_event_message', { p_id: id, p_status: status, ...extra })
  }

  while (!outOfTime()) {
    const { data: batch, error } = await veltzy.rpc('claim_event_messages', {
      p_limit: opts.batchSize ?? 50,
      p_message_id: opts.messageId ?? null,
    })
    if (error) throw new Error(`claim_event_messages: ${error.message}`)
    const messages = (batch ?? []) as QueuedMessage[]
    if (messages.length === 0) break

    for (const msg of messages) {
      summary.processed++
      if (outOfTime()) {
        await complete(msg.id, 'deferred')
        summary.deferred++
        continue
      }
      try {
        const ctx = await loadContext(veltzy, msg)
        if (!ctx) {
          await complete(msg.id, 'canceled', { p_error: 'inscricao ou evento nao encontrado' })
          summary.skipped++
          continue
        }
        const { reg, event, lead, consentRevoked } = ctx
        const session: string | null = event.whatsapp_session_name || null

        if (session && !sessionStatus.has(session)) {
          const { data: inst } = await pub
            .from('waha_instances').select('status')
            .eq('session_name', session).eq('company_id', event.company_id).maybeSingle()
          sessionStatus.set(session, inst?.status === 'connected')
        }

        let sentLastMinute = 0
        if (session) {
          const since = new Date(Date.now() - 60_000).toISOString()
          const { count } = await veltzy
            .from('event_messages').select('id', { count: 'exact', head: true })
            .eq('instance_name', session).eq('status', 'sent').gte('sent_at', since)
          const local = (sentLocal.get(session) ?? []).filter((t) => Date.now() - t < 60_000)
          // o count do banco ja inclui os envios desta execucao; o local cobre atraso de replicacao
          sentLastMinute = Math.max(count ?? 0, local.length)
        }

        const decision = decideMessageAction({
          kind: msg.kind,
          registrationStatus: reg.status,
          eventStatus: event.status,
          messages: event.messages ?? {},
          leadOptOut: lead?.marketing_opt_out === true,
          consentMarketing: reg.consent_marketing === true,
          marketingConsentRevoked: consentRevoked,
          sessionName: session,
          sessionConnected: session ? sessionStatus.get(session) === true : false,
          sentLastMinute,
          dateUnchanged: msg.kind === 'date_change' && isSameEventDay(msg.ref_starts_at, event.starts_at, event.timezone),
        })

        if (decision.action !== 'send') {
          const kindChanged = decision.kind !== msg.kind ? { p_kind: decision.kind } : {}
          await complete(msg.id, decision.action, kindChanged)
          if (decision.action === 'deferred') summary.deferred++
          else summary.skipped++
          continue
        }

        const text = renderEventMessage(decision.template, {
          primeiro_nome: reg.first_name,
          evento: event.title,
          data: formatEventDate(event.starts_at, event.timezone),
          hora: formatEventTime(event.starts_at, event.timezone),
          data_anterior: formatEventDate(msg.ref_starts_at, event.timezone),
          hora_anterior: formatEventTime(msg.ref_starts_at, event.timezone),
          local: formatEventLocation(event),
          link_inscricao: registrationUrl(event.slug, reg.public_token),
          link_confirmar: confirmUrl(event.slug, reg.public_token),
          link_online: event.format !== 'presencial' ? (event.online_url ?? '') : '',
        })

        // espera aleatoria de 2 a 5 s entre envios da mesma sessao
        const last = lastSendAt.get(session!)
        if (last !== undefined) {
          const wait = randomGap() - (Date.now() - last)
          if (wait > 0) await sleep(wait)
        }

        const phone: string = lead?.phone ?? reg.whatsapp
        let externalId: string | null = null
        try {
          const res = await createProvider('waha').sendMessage({} as WhatsAppConfig, {
            phone,
            content: text,
            type: 'text',
            sessionName: session!,
            companyId: event.company_id,
          })
          externalId = res?.externalId ?? null
        } catch (err) {
          lastSendAt.set(session!, Date.now())
          await complete(msg.id, 'failed', { p_error: (err as Error).message, p_instance: session })
          summary.failed++
          continue
        }
        lastSendAt.set(session!, Date.now())
        sentLocal.set(session!, [...(sentLocal.get(session!) ?? []), Date.now()])

        // historico no Inbox (so o que saiu de fato; falha com retry nao polui a conversa)
        if (reg.lead_id) {
          await veltzy.from('messages').insert({
            lead_id: reg.lead_id,
            company_id: event.company_id,
            content: text,
            sender_type: 'ai',
            message_type: 'text',
            source: 'whatsapp',
            instance_name: session,
            delivery_status: 'sent',
            external_id: externalId,
          })
        }

        await complete(msg.id, 'sent', {
          p_instance: session,
          p_provider_message_id: externalId,
          p_rendered_text: text,
          ...(decision.kind !== msg.kind ? { p_kind: decision.kind } : {}),
        })
        summary.sent++
      } catch (err) {
        console.error('[events/dispatch] erro na mensagem', msg.id, err)
        await complete(msg.id, 'failed', { p_error: (err as Error).message })
        summary.failed++
      }
    }

    if (opts.messageId) break // disparo pontual: uma mensagem so
  }

  return summary
}
