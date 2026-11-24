import { assertEquals } from 'jsr:@std/assert@1'
import { decideMessageAction, type DecisionInput } from './dispatch.ts'

const msgs = {
  confirmation: { enabled: true, text: 'Oi {{primeiro_nome}}' },
  reminder_d1: { enabled: true, text: 'Amanha' },
  post_present: { enabled: true, text: 'Obrigado' },
  post_absent: { enabled: true, text: 'Sentimos sua falta' },
  cancel_notice: { enabled: false, text: 'Cancelado' },
}
const base: DecisionInput = {
  kind: 'confirmation', registrationStatus: 'registered', eventStatus: 'published', messages: msgs,
  leadOptOut: false, consentMarketing: false, marketingConsentRevoked: false,
  sessionName: 'sess', sessionConnected: true, sentLastMinute: 0,
}

Deno.test('envia confirmacao no caminho feliz', () => {
  assertEquals(decideMessageAction(base), { action: 'send', kind: 'confirmation', template: 'Oi {{primeiro_nome}}' })
})

Deno.test('reenvio por duplicidade usa o texto da confirmacao', () => {
  const d = decideMessageAction({ ...base, kind: 'duplicate_resend' })
  assertEquals(d, { action: 'send', kind: 'duplicate_resend', template: 'Oi {{primeiro_nome}}' })
})

Deno.test('inscricao cancelada ou evento cancelado cancela (menos o aviso de cancelamento)', () => {
  assertEquals(decideMessageAction({ ...base, registrationStatus: 'canceled' }).action, 'canceled')
  assertEquals(decideMessageAction({ ...base, eventStatus: 'canceled' }).action, 'canceled')
  const notice = decideMessageAction({ ...base, kind: 'cancel_notice', eventStatus: 'canceled',
    messages: { ...msgs, cancel_notice: { enabled: true, text: 'Cancelado' } } })
  assertEquals(notice.action, 'send')
})

Deno.test('descadastrado nao recebe nada, nem transacional', () => {
  assertEquals(decideMessageAction({ ...base, leadOptOut: true }).action, 'skipped_opt_out')
})

Deno.test('pos-evento: tipo recalculado pelo status e exige consentimento ativo', () => {
  const post = { ...base, kind: 'post_present' as const, consentMarketing: true }
  assertEquals(decideMessageAction({ ...post, registrationStatus: 'absent' }), { action: 'send', kind: 'post_absent', template: 'Sentimos sua falta' })
  assertEquals(decideMessageAction({ ...post, registrationStatus: 'attended' }).kind, 'post_present')
  assertEquals(decideMessageAction({ ...post, registrationStatus: 'confirmed' }).action, 'canceled')
  assertEquals(decideMessageAction({ ...post, registrationStatus: 'attended', consentMarketing: false }).action, 'skipped_no_consent')
  assertEquals(decideMessageAction({ ...post, registrationStatus: 'attended', marketingConsentRevoked: true }).action, 'skipped_no_consent')
})

Deno.test('mensagem desligada depois de enfileirada e cancelada', () => {
  assertEquals(decideMessageAction({ ...base, kind: 'cancel_notice' }).action, 'canceled')
})

Deno.test('sem sessao ou sessao desconectada', () => {
  assertEquals(decideMessageAction({ ...base, sessionName: null }).action, 'skipped_no_instance')
  assertEquals(decideMessageAction({ ...base, sessionConnected: false }).action, 'skipped_no_instance')
})

Deno.test('limite de 20 por minuto por sessao adia', () => {
  assertEquals(decideMessageAction({ ...base, sentLastMinute: 19 }).action, 'send')
  assertEquals(decideMessageAction({ ...base, sentLastMinute: 20 }).action, 'deferred')
})
