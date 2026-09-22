import { assertEquals } from 'jsr:@std/assert@1'
import { buildAudiencePlan } from './blast-audience.ts'

Deno.test('filtro vazio: so company-scope + exclui opt-out, sem outros predicados', () => {
  const plan = buildAudiencePlan({})
  assertEquals(plan, { companyScoped: true, excludeOptOut: true })
})

Deno.test('filtro nulo/undefined: mesmo comportamento seguro', () => {
  assertEquals(buildAudiencePlan(null), { companyScoped: true, excludeOptOut: true })
  assertEquals(buildAudiencePlan(undefined), { companyScoped: true, excludeOptOut: true })
})

Deno.test('temperature/tags/source viram predicados quando presentes', () => {
  const plan = buildAudiencePlan({
    temperature: ['hot', 'warm'],
    tags: ['vip'],
    source_id: 'src-123',
  })
  assertEquals(plan.temperatureIn, ['hot', 'warm'])
  assertEquals(plan.tagsOverlap, ['vip'])
  assertEquals(plan.sourceEq, 'src-123')
  assertEquals(plan.companyScoped, true)
  assertEquals(plan.excludeOptOut, true)
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
