import { describe, expect, it } from 'vitest'
import { formatDocumentBR } from './document-br'

describe('formatDocumentBR', () => {
  it('CPF completo e parcial', () => {
    expect(formatDocumentBR('52998224725')).toBe('529.982.247-25')
    expect(formatDocumentBR('5299')).toBe('529.9')
    expect(formatDocumentBR('529982247')).toBe('529.982.247')
  })

  it('CNPJ completo e corta em 14 digitos', () => {
    expect(formatDocumentBR('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatDocumentBR('11.222.333/0001-8199')).toBe('11.222.333/0001-81')
  })

  it('ignora o que nao e digito', () => {
    expect(formatDocumentBR('abc')).toBe('')
  })
})
