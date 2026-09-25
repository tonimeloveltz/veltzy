import { assertEquals } from 'jsr:@std/assert@1'
import { getTemplateBodyText, renderTemplateBody, resolveTemplateParams } from './blast-render.ts'

Deno.test('getTemplateBodyText: pega o BODY, ignora HEADER/FOOTER', () => {
  const components = [
    { type: 'HEADER', text: 'Oi' },
    { type: 'BODY', text: 'Ola {{1}}, aproveite {{2}}' },
    { type: 'FOOTER', text: 'rodape' },
  ]
  assertEquals(getTemplateBodyText(components), 'Ola {{1}}, aproveite {{2}}')
})

Deno.test('getTemplateBodyText: case-insensitive no type', () => {
  assertEquals(getTemplateBodyText([{ type: 'body', text: 'corpo' }]), 'corpo')
})

Deno.test('getTemplateBodyText: sem BODY ou entrada invalida → string vazia', () => {
  assertEquals(getTemplateBodyText([{ type: 'HEADER', text: 'x' }]), '')
  assertEquals(getTemplateBodyText([]), '')
  assertEquals(getTemplateBodyText(null), '')
  assertEquals(getTemplateBodyText(undefined), '')
})

Deno.test('render: resolve lead.<campo> e literal fixo', () => {
  const out = renderTemplateBody(
    'Ola {{1}}, aproveite {{2}}!',
    { '1': 'lead.name', '2': 'Black Friday' },
    { name: 'Maria', phone: '5511999' },
  )
  assertEquals(out, 'Ola Maria, aproveite Black Friday!')
})

Deno.test('render: campo do lead ausente/nulo → vazio (nao quebra)', () => {
  const out = renderTemplateBody('Oi {{1}}', { '1': 'lead.name' }, { name: null })
  assertEquals(out, 'Oi ')
})

Deno.test('render: indice sem mapping → vazio (nunca deixa {{n}} cru)', () => {
  const out = renderTemplateBody('A {{1}} B {{2}} C', { '1': 'X' }, {})
  assertEquals(out, 'A X B  C')
})

Deno.test('render: multiplas ocorrencias do mesmo indice', () => {
  const out = renderTemplateBody('{{1}} e de novo {{1}}', { '1': 'lead.name' }, { name: 'Ana' })
  assertEquals(out, 'Ana e de novo Ana')
})

Deno.test('render: tolera espacos dentro das chaves {{ 1 }}', () => {
  const out = renderTemplateBody('Oi {{ 1 }}', { '1': 'lead.name' }, { name: 'Jo' })
  assertEquals(out, 'Oi Jo')
})

Deno.test('render: mapping nulo → todos os placeholders viram vazio', () => {
  assertEquals(renderTemplateBody('a{{1}}b', null, {}), 'ab')
})

Deno.test('resolveTemplateParams: array em ordem crescente das variaveis', () => {
  const params = resolveTemplateParams(
    'Ola {{1}}, aproveite {{2}}!',
    { '1': 'lead.name', '2': 'Black Friday' },
    { name: 'Maria' },
  )
  assertEquals(params, ['Maria', 'Black Friday'])
})

Deno.test('resolveTemplateParams: sem variaveis → array vazio', () => {
  assertEquals(resolveTemplateParams('texto fixo', { '1': 'lead.name' }, { name: 'X' }), [])
})

Deno.test('resolveTemplateParams: indice sem mapping / campo nulo → string vazia na posicao', () => {
  assertEquals(resolveTemplateParams('{{1}} {{2}}', { '1': 'lead.name' }, { name: null }), ['', ''])
})

Deno.test('resolveTemplateParams: ordem segue o indice, nao a ocorrencia', () => {
  assertEquals(
    resolveTemplateParams('{{2}} antes de {{1}}', { '1': 'A', '2': 'B' }, {}),
    ['A', 'B'],
  )
})
