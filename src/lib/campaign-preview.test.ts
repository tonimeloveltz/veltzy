import { describe, expect, it } from 'vitest'
import { documentMeta, parseWhatsAppFormatting, renderPreviewText } from '@/lib/campaign-preview'

describe('renderPreviewText', () => {
  it('troca variáveis nomeadas pelo contato de exemplo', () => {
    expect(renderPreviewText('Oi {{nome}} {{sobrenome}}, da {{empresa}}')).toBe('Oi Maria Silva, da Empresa Exemplo')
    expect(renderPreviewText('{{nome_completo}} / {{ Telefone }}')).toBe('Maria Silva / (11) 98765-4321')
  })

  it('variável desconhecida some, como no envio', () => {
    expect(renderPreviewText('Oi {{cidade}}.')).toBe('Oi .')
  })

  it('template: {{n}} pelo mapping (campo ou texto fixo)', () => {
    expect(renderPreviewText('Oi {{1}}, cupom {{2}}', { 1: 'lead.first_name', 2: 'BEMVINDO' })).toBe('Oi Maria, cupom BEMVINDO')
    expect(renderPreviewText('Oi {{1}}')).toBe('Oi Maria')
  })
})

const fmt = (text: string) =>
  parseWhatsAppFormatting(text).map((r) => `${r.bold ? 'B' : ''}${r.italic ? 'I' : ''}${r.strike ? 'S' : ''}[${r.text}]`).join('')

describe('parseWhatsAppFormatting', () => {
  it('negrito, itálico e tachado', () => {
    expect(fmt('Oi *Maria*, _veja_ ~isso~.')).toBe('[Oi ]B[Maria][, ]I[veja][ ]S[isso][.]')
  })

  it('aninhado', () => {
    expect(fmt('*_oferta_*')).toBe('BI[oferta]')
  })

  it('literal: dobrado, com espaço por dentro, colado em palavra ou sem fechar', () => {
    expect(fmt('**x**')).toBe('[**x**]')
    expect(fmt('* x *')).toBe('[* x *]')
    expect(fmt('nome_completo_x')).toBe('[nome_completo_x]')
    expect(fmt('2*3 e *aberto')).toBe('[2*3 e *aberto]')
  })

  it('não atravessa linha', () => {
    expect(fmt('*a\nb*')).toBe('[*a\nb*]')
  })
})

describe('documentMeta', () => {
  it('extensão e tamanho', () => {
    expect(documentMeta('proposta.pdf')).toBe('PDF')
    expect(documentMeta('proposta.pdf', 1.5 * 1024 * 1024)).toBe('PDF · 1,5 MB')
    expect(documentMeta('a.docx', 2048)).toBe('DOCX · 2 KB')
    expect(documentMeta('arquivo')).toBe('ARQUIVO')
  })
})
