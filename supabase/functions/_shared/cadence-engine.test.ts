import { assertEquals } from 'jsr:@std/assert@1'
import { decideCadenceAction, type CadenceStepLite } from './cadence-engine.ts'

const NOW = new Date('2026-09-23T12:00:00.000Z')
const noSignals = { optOut: false, leadResponded: false, stageChanged: false }
const steps: CadenceStepLite[] = [
  { action_type: 'send_message', config: { content: 'Oi' } },
  { action_type: 'wait', config: { days: 3 } },
  { action_type: 'send_template', config: { template_id: 't1' } },
]

Deno.test('opt-out cancela sempre (maior precedência)', () => {
  const d = decideCadenceAction({ current_step: 0 }, steps, { ...noSignals, optOut: true, leadResponded: true }, { cancelOnStageChange: false, now: NOW })
  assertEquals(d, { kind: 'cancel', reason: 'opt_out' })
})

Deno.test('lead respondeu cancela (sempre, mesmo sem config)', () => {
  const d = decideCadenceAction({ current_step: 1 }, steps, { ...noSignals, leadResponded: true }, { cancelOnStageChange: false, now: NOW })
  assertEquals(d, { kind: 'cancel', reason: 'lead_responded' })
})

Deno.test('mudança de stage só cancela se configurado', () => {
  const off = decideCadenceAction({ current_step: 0 }, steps, { ...noSignals, stageChanged: true }, { cancelOnStageChange: false, now: NOW })
  assertEquals(off.kind, 'execute') // ignora stageChanged
  const on = decideCadenceAction({ current_step: 0 }, steps, { ...noSignals, stageChanged: true }, { cancelOnStageChange: true, now: NOW })
  assertEquals(on, { kind: 'cancel', reason: 'stage_changed' })
})

Deno.test('step de ação → execute, avança e fica elegível já (nextRunAt=now)', () => {
  const d = decideCadenceAction({ current_step: 0 }, steps, noSignals, { cancelOnStageChange: false, now: NOW })
  assertEquals(d, { kind: 'execute', step: steps[0], nextStep: 1, nextRunAt: NOW.toISOString() })
})

Deno.test('step wait → agenda next_run_at = now + dias/horas e avança', () => {
  const d = decideCadenceAction({ current_step: 1 }, steps, noSignals, { cancelOnStageChange: false, now: NOW })
  assertEquals(d, {
    kind: 'wait',
    nextStep: 2,
    nextRunAt: new Date('2026-09-26T12:00:00.000Z').toISOString(), // +3 dias
  })
})

Deno.test('wait com horas', () => {
  const s: CadenceStepLite[] = [{ action_type: 'wait', config: { hours: 6 } }]
  const d = decideCadenceAction({ current_step: 0 }, s, noSignals, { cancelOnStageChange: false, now: NOW })
  assertEquals(d.kind === 'wait' && d.nextRunAt, new Date('2026-09-23T18:00:00.000Z').toISOString())
})

Deno.test('current_step além do último → complete', () => {
  const d = decideCadenceAction({ current_step: 3 }, steps, noSignals, { cancelOnStageChange: false, now: NOW })
  assertEquals(d, { kind: 'complete' })
})

Deno.test('cadência vazia → complete de cara', () => {
  const d = decideCadenceAction({ current_step: 0 }, [], noSignals, { cancelOnStageChange: false, now: NOW })
  assertEquals(d, { kind: 'complete' })
})
