import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { formatEventDate, formatEventLocation, formatEventTime, isSameEventDay, OPT_OUT_FOOTER, renderEventMessage } from './render.ts'

const TPL = 'Oi, {{primeiro_nome}}! {{evento}}\n📍 {{local}}\nLink: {{link_online}}\nDetalhes: {{link_inscricao}}'

Deno.test('render: troca variaveis e mantem a linha do link online quando ha link', () => {
  const out = renderEventMessage(TPL, {
    primeiro_nome: 'Ana', evento: 'Workshop', local: 'Online',
    link_online: 'https://meet.x/abc', link_inscricao: 'https://app/e/w/i/t',
  })
  assertEquals(out, 'Oi, Ana! Workshop\n📍 Online\nLink: https://meet.x/abc\nDetalhes: https://app/e/w/i/t' + OPT_OUT_FOOTER)
})

Deno.test('render: sem link online a linha inteira sai', () => {
  const out = renderEventMessage(TPL, { primeiro_nome: 'Ana', evento: 'W', local: 'Auditório', link_online: '', link_inscricao: 'u' })
  assertEquals(out.includes('Link:'), false)
  assertEquals(out, 'Oi, Ana! W\n📍 Auditório\nDetalhes: u' + OPT_OUT_FOOTER)
})

Deno.test('render: rodape de descadastro sempre presente, mesmo com template vazio', () => {
  assertStringIncludes(renderEventMessage('', {}), 'responda SAIR.')
  assertStringIncludes(renderEventMessage('Oi {{desconhecida}}', {}), 'responda SAIR.')
  assertEquals(renderEventMessage('Oi {{desconhecida}}', {}), 'Oi' + OPT_OUT_FOOTER)
})

Deno.test('datas: fuso do evento, nao do servidor (UTC)', () => {
  // 28/11/2026 01:30 UTC = 27/11 22:30 em Sao Paulo (sexta)
  const iso = '2026-11-28T01:30:00Z'
  assertEquals(formatEventDate(iso, 'America/Sao_Paulo'), 'sex, 27 de nov')
  assertEquals(formatEventTime(iso, 'America/Sao_Paulo'), '22:30')
  assertEquals(formatEventDate(iso, 'UTC'), 'sáb, 28 de nov')
  assertEquals(formatEventTime(iso, 'UTC'), '01:30')
  assertEquals(formatEventTime('2026-11-28T12:00:00Z', 'America/Manaus'), '08:00')
})

Deno.test('datas: nulo vira vazio', () => {
  assertEquals(formatEventDate(null, 'America/Sao_Paulo'), '')
  assertEquals(formatEventTime(null, 'America/Sao_Paulo'), '')
})

Deno.test('local: online vira "Online"; presencial junta so o que existe', () => {
  const base = { venue_name: 'Hub Inovação', street: 'Rua A', number: '10', district: null, city: 'Recife', state: 'PE' }
  assertEquals(formatEventLocation({ ...base, format: 'online' }), 'Online')
  assertEquals(formatEventLocation({ ...base, format: 'presencial' }), 'Hub Inovação - Rua A, 10 - Recife/PE')
  assertEquals(formatEventLocation({ format: 'hibrido', venue_name: null, street: null, number: null, district: null, city: 'Recife', state: null }), 'Recife')
})

Deno.test('mesmo dia: compara no fuso do evento, nao em UTC', () => {
  const tz = 'America/Sao_Paulo'
  // 27/11 09:00 e 27/11 22:30 em SP (01:30 de 28/11 em UTC): mesmo dia
  assertEquals(isSameEventDay('2026-11-27T12:00:00Z', '2026-11-28T01:30:00Z', tz), true)
  // 27/11 09:00 e 28/11 09:00 em SP: dias diferentes
  assertEquals(isSameEventDay('2026-11-27T12:00:00Z', '2026-11-28T12:00:00Z', tz), false)
  assertEquals(isSameEventDay(null, '2026-11-28T12:00:00Z', tz), false)
})

Deno.test('render: variaveis do aviso de data', () => {
  const out = renderEventMessage('{{data}} às {{hora}} (antes: {{data_anterior}} às {{hora_anterior}})', {
    data: 'sáb, 28 de nov', hora: '09:00', data_anterior: 'sex, 27 de nov', hora_anterior: '10:00',
  })
  assertEquals(out, 'sáb, 28 de nov às 09:00 (antes: sex, 27 de nov às 10:00)' + OPT_OUT_FOOTER)
})
