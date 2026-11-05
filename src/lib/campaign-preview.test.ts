import { describe, expect, it } from 'vitest'
import { documentMeta, renderPreviewSegments } from '@/lib/campaign-preview'

const join = (text: string, mapping: Record<string, string> | null = null) =>
  renderPreviewSegments(text, mapping).map((s) => s.text).join('')

describe('renderPreviewSegments', () => {
  it('troca variáveis nomeadas pelo contato de exemplo', () => {
    expect(join('Oi {{nome}} {{sobrenome}}, da {{empresa}}')).toBe('Oi Maria Silva, da Empresa Exemplo')
    expect(join('{{nome_completo}} / {{ Telefone }}')).toBe('Maria Silva / (11) 98765-4321')
  })

  it('marca os trechos de variável', () => {
    const segs = renderPreviewSegments('Oi {{nome}}!')
    expect(segs).toEqual([
      { text: 'Oi ', isVar: false },
      { text: 'Maria', isVar: true },
      { text: '!', isVar: false },
    ])
  })

  it('variável desconhecida some, como no envio', () => {
    expect(join('Oi {{cidade}}.')).toBe('Oi .')
  })

  it('template: {{n}} pelo mapping (campo ou texto fixo)', () => {
    expect(join('Oi {{1}}, cupom {{2}}', { 1: 'lead.first_name', 2: 'BEMVINDO' })).toBe('Oi Maria, cupom BEMVINDO')
    expect(join('Oi {{1}}')).toBe('Oi Maria')
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
