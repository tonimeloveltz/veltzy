import { assertEquals } from 'jsr:@std/assert@1'
import { queueStatusToRecipient, isCampaignComplete, followupTargets, scheduledStartAt, campaignProgress } from './blast-followup.ts'

Deno.test('campaignProgress: em andamento já devolve sent/failed parciais e não completa', () => {
  assertEquals(campaignProgress({ total: 10, open: 6, sent: 3, failed: 1 }), { sent: 3, failed: 1, complete: false })
})

Deno.test('campaignProgress: completa quando não sobra pending/queued (skipped conta como terminal)', () => {
  // 10 = 7 sent + 1 failed + 2 skipped
  assertEquals(campaignProgress({ total: 10, open: 0, sent: 7, failed: 1 }), { sent: 7, failed: 1, complete: true })
})

Deno.test('campaignProgress: sem recipients não completa', () => {
  assertEquals(campaignProgress({ total: 0, open: 0, sent: 0, failed: 0 }).complete, false)
})

Deno.test('campaignProgress: acima de 1000 recipients o número é o real, sem teto', () => {
  assertEquals(campaignProgress({ total: 2500, open: 0, sent: 2400, failed: 100 }), { sent: 2400, failed: 100, complete: true })
})

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

Deno.test('scheduledStartAt: horario chegou → started_at = scheduled_at; futuro/nulo → null', () => {
  const now = new Date('2026-11-04T12:00:00Z')
  assertEquals(scheduledStartAt('2026-11-04T11:30:00Z', now), '2026-11-04T11:30:00.000Z')
  assertEquals(scheduledStartAt('2026-11-04T12:00:00Z', now), '2026-11-04T12:00:00.000Z')
  assertEquals(scheduledStartAt('2026-11-04T12:00:01Z', now), null)
  assertEquals(scheduledStartAt(null, now), null)
  assertEquals(scheduledStartAt('invalido', now), null)
})
