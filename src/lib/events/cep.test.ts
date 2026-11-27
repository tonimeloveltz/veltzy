import { describe, expect, it } from 'vitest'
import { formatCep } from './cep'

describe('formatCep', () => {
  it('poe o hifen depois do quinto digito', () => expect(formatCep('01001000')).toBe('01001-000'))
  it('corta em 8 digitos', () => expect(formatCep('123456789')).toBe('12345-678'))
  it('ignora o que nao e digito', () => expect(formatCep('01.001-000a')).toBe('01001-000'))
  it('nao poe hifen com 5 digitos ou menos', () => expect(formatCep('01001')).toBe('01001'))
})
