import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { isPurgeDue, type PurgeCandidate } from './campaign-media-purge.ts'

const now = new Date('2026-12-31T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()
const base: PurgeCandidate = {
  id: 'c1', status: 'completed', media_path: 'co/campaigns/u/a.pdf', media_purged_at: null,
  completed_at: daysAgo(31), updated_at: daysAgo(31), created_at: daysAgo(40),
}

Deno.test('concluída há 31 dias: expurga', () => assertEquals(isPurgeDue(base, now), true))
Deno.test('concluída há 29 dias: mantém', () => assertEquals(isPurgeDue({ ...base, completed_at: daysAgo(29) }, now), false))
Deno.test('falhou sem completed_at usa updated_at', () =>
  assertEquals(isPurgeDue({ ...base, status: 'failed', completed_at: null, updated_at: daysAgo(35) }, now), true))
Deno.test('rascunho criado há 31 dias: expurga', () =>
  assertEquals(isPurgeDue({ ...base, status: 'draft', completed_at: null, created_at: daysAgo(31) }, now), true))
Deno.test('rascunho recente: mantém', () =>
  assertEquals(isPurgeDue({ ...base, status: 'draft', completed_at: null, created_at: daysAgo(5) }, now), false))
Deno.test('em envio: mantém', () => assertEquals(isPurgeDue({ ...base, status: 'running' }, now), false))
Deno.test('já expurgada ou sem arquivo: ignora', () => {
  assertEquals(isPurgeDue({ ...base, media_purged_at: daysAgo(1) }, now), false)
  assertEquals(isPurgeDue({ ...base, media_path: null }, now), false)
})
