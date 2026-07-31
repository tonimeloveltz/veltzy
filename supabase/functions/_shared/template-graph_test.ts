import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildComponents } from './template-graph.ts'

Deno.test('buildComponents: BODY sempre presente, example no formato Graph', () => {
  const c = buildComponents({ body: { text: 'Ola {{1}}', examples: ['Joao'] } })
  assertEquals(c.length, 1)
  assertEquals(c[0], { type: 'BODY', text: 'Ola {{1}}', example: { body_text: [['Joao']] } })
})

Deno.test('buildComponents: BODY sem exemplo nao inclui example', () => {
  const c = buildComponents({ body: { text: 'fixo' } })
  assertEquals(c[0], { type: 'BODY', text: 'fixo' })
})

Deno.test('buildComponents: ordem canonica HEADER, BODY, FOOTER, BUTTONS', () => {
  const c = buildComponents({
    body: { text: 'corpo' },
    header: { format: 'TEXT', text: 'cab' },
    footer: { text: 'rodape' },
    buttons: [{ type: 'QUICK_REPLY', text: 'ok' }],
  })
  assertEquals(c.map((x) => x.type), ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'])
})

Deno.test('buildComponents: header sem format cai pra TEXT', () => {
  const c = buildComponents({ body: { text: 'x' }, header: { text: 'cab' } as { format: string; text: string } })
  const header = c.find((x) => x.type === 'HEADER')
  assertEquals(header?.format, 'TEXT')
})

Deno.test('buildComponents: omite header/footer/buttons vazios', () => {
  const c = buildComponents({ body: { text: 'x' }, buttons: [] })
  assertEquals(c.map((x) => x.type), ['BODY'])
})
