import { assertEquals } from 'jsr:@std/assert@1'
import { queueStatusToRecipient, isCampaignComplete, followupTargets } from './blast-followup.ts'

Deno.test('queueStatusToRecipient: mapeia terminais; pending mantém (null)', () => {
  assertEquals(queueStatusToRecipient('sent'), 'sent')
  assertEquals(queueStatusToRecipient('failed'), 'failed')
  assertEquals(queueStatusToRecipient('cancelled'), 'skipped')
  assertEquals(queueStatusToRecipient('pending'), null)
})

Deno.test('isCampaignComplete: todos terminais + tem recipients', () => {
  assertEquals(isCampaignComplete(['sent', 'failed', 'skipped']), true)
  assertEquals(isCampaignComplete(['sent', 'queued']), false) // 1 ainda na fila
  assertEquals(isCampaignComplete([]), false) // sem recipients não completa
})

Deno.test('followupTargets immediate: todos os SENT', () => {
  const recs = [
    { lead_id: 'L1', status: 'sent' },
    { lead_id: 'L2', status: 'failed' },
    { lead_id: 'L3', status: 'sent' },
  ]
  assertEquals(followupTargets(recs, 'immediate', new Set()).sort(), ['L1', 'L3'])
})

Deno.test('followupTargets no_reply: SENT que NÃO responderam', () => {
  const recs = [
    { lead_id: 'L1', status: 'sent' },
    { lead_id: 'L2', status: 'sent' },
    { lead_id: 'L3', status: 'failed' },
  ]
  // L2 respondeu → sai; L3 falhou → nunca entra
  assertEquals(followupTargets(recs, 'no_reply', new Set(['L2'])), ['L1'])
})

Deno.test('followupTargets: ignora recipient sem lead_id', () => {
  assertEquals(followupTargets([{ lead_id: null, status: 'sent' }], 'immediate', new Set()), [])
})
