import { assertEquals } from 'jsr:@std/assert@1'
import { leadMatchesConditions, type CadenceCondition } from './cadence-conditions.ts'

const lead = { temperature: 'hot', name: 'Ana', source_id: 'src-1', tags: ['vip', 'x'] }

Deno.test('lista vazia/nula = passa (sem filtro)', () => {
  assertEquals(leadMatchesConditions([], lead), true)
  assertEquals(leadMatchesConditions(null, lead), true)
})

Deno.test('eq / neq', () => {
  assertEquals(leadMatchesConditions([{ field: 'temperature', operator: 'eq', value: 'hot' }], lead), true)
  assertEquals(leadMatchesConditions([{ field: 'temperature', operator: 'eq', value: 'cold' }], lead), false)
  assertEquals(leadMatchesConditions([{ field: 'temperature', operator: 'neq', value: 'cold' }], lead), true)
})

Deno.test('contains (string) e in (array de valores)', () => {
  assertEquals(leadMatchesConditions([{ field: 'name', operator: 'contains', value: 'An' }], lead), true)
  assertEquals(leadMatchesConditions([{ field: 'temperature', operator: 'in', value: ['hot', 'warm'] }], lead), true)
  assertEquals(leadMatchesConditions([{ field: 'temperature', operator: 'in', value: ['cold'] }], lead), false)
})

Deno.test('AND: todas precisam passar', () => {
  const conds: CadenceCondition[] = [
    { field: 'temperature', operator: 'eq', value: 'hot' },
    { field: 'source_id', operator: 'eq', value: 'src-1' },
  ]
  assertEquals(leadMatchesConditions(conds, lead), true)
  conds.push({ field: 'name', operator: 'eq', value: 'Outro' })
  assertEquals(leadMatchesConditions(conds, lead), false)
})
