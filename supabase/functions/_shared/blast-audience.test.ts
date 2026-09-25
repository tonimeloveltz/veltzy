import { assertEquals } from 'jsr:@std/assert@1'
import { buildAudiencePlan, leadIdsInStages } from './blast-audience.ts'

Deno.test('leadIdsInStages: usa o deal ABERTO mais recente por lead (critério A estrito)', () => {
  const deals = [
    { lead_id: 'L1', stage_id: 'S_old', created_at: '2026-01-01T00:00:00Z' },
    { lead_id: 'L1', stage_id: 'S_new', created_at: '2026-02-01T00:00:00Z' }, // mais recente
    { lead_id: 'L2', stage_id: 'S_new', created_at: '2026-01-15T00:00:00Z' },
    { lead_id: 'L3', stage_id: 'S_other', created_at: '2026-03-01T00:00:00Z' },
  ]
  // quer S_new: L1 (mais recente é S_new) + L2; L3 fica de fora (mais recente é S_other)
  assertEquals(leadIdsInStages(deals, ['S_new']).sort(), ['L1', 'L2'])
})

Deno.test('leadIdsInStages: lead cujo deal MAIS RECENTE saiu do stage NÃO entra', () => {
  const deals = [
    { lead_id: 'L1', stage_id: 'S_alvo', created_at: '2026-01-01T00:00:00Z' },
    { lead_id: 'L1', stage_id: 'S_depois', created_at: '2026-02-01T00:00:00Z' }, // moveu p/ fora
  ]
  assertEquals(leadIdsInStages(deals, ['S_alvo']), [])
})

Deno.test('leadIdsInStages: multi-stage + sem deals → vazio', () => {
  assertEquals(leadIdsInStages([], ['S1']), [])
  const deals = [{ lead_id: 'L1', stage_id: 'A', created_at: '2026-01-01T00:00:00Z' }]
  assertEquals(leadIdsInStages(deals, ['A', 'B']), ['L1'])
})

Deno.test('filtro vazio: so company-scope + exclui opt-out, sem outros predicados', () => {
  const plan = buildAudiencePlan({})
  assertEquals(plan, { companyScoped: true, excludeOptOut: true })
})

Deno.test('filtro nulo/undefined: mesmo comportamento seguro', () => {
  assertEquals(buildAudiencePlan(null), { companyScoped: true, excludeOptOut: true })
  assertEquals(buildAudiencePlan(undefined), { companyScoped: true, excludeOptOut: true })
})

Deno.test('temperature/tags/source/stage viram predicados quando presentes', () => {
  const plan = buildAudiencePlan({
    temperature: ['hot', 'warm'],
    tags: ['vip'],
    source_id: 'src-123',
    stage_id: ['stage-1', 'stage-2'],
  })
  assertEquals(plan.temperatureIn, ['hot', 'warm'])
  assertEquals(plan.tagsOverlap, ['vip'])
  assertEquals(plan.sourceEq, 'src-123')
  assertEquals(plan.stageIn, ['stage-1', 'stage-2'])
  assertEquals(plan.companyScoped, true)
  assertEquals(plan.excludeOptOut, true)
})

Deno.test('stage_id vazio/lixo é omitido (não vira predicado)', () => {
  assertEquals(buildAudiencePlan({ stage_id: [] }).stageIn, undefined)
  assertEquals(buildAudiencePlan({ stage_id: ['', '  '] }).stageIn, undefined)
})

Deno.test('arrays vazios ou com lixo sao omitidos (nao viram predicado)', () => {
  const plan = buildAudiencePlan({
    temperature: ['', '  '],
    tags: [123 as unknown as string, ''],
    source_id: '   ',
  })
  assertEquals(plan.temperatureIn, undefined)
  assertEquals(plan.tagsOverlap, undefined)
  assertEquals(plan.sourceEq, undefined)
})

Deno.test('status/pipeline_id/stage_id ignorados na Fase 1 (vivem/dependem de deals)', () => {
  const plan = buildAudiencePlan({ status: ['open'], pipeline_id: 'p-1', stage_id: 's-1' } as never)
  assertEquals(plan, { companyScoped: true, excludeOptOut: true })
})

Deno.test('tags com itens validos e invalidos: mantem so os validos', () => {
  const plan = buildAudiencePlan({ tags: ['vip', '', 'black-friday'] })
  assertEquals(plan.tagsOverlap, ['vip', 'black-friday'])
})
