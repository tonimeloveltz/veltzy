import { describe, it, expect } from 'vitest'
import { validateInstagramAttachment } from '@/lib/instagram-attachment'

const MB = 1024 * 1024
const file = (type: string, size = 1 * MB) => ({ type, size })

describe('validateInstagramAttachment', () => {
  it('aceita png, jpeg, pdf, audio mp4 e video quicktime dentro do limite', () => {
    expect(validateInstagramAttachment(file('image/png'))).toBeNull()
    expect(validateInstagramAttachment(file('image/jpeg'))).toBeNull()
    expect(validateInstagramAttachment(file('application/pdf'))).toBeNull()
    expect(validateInstagramAttachment(file('audio/mp4'))).toBeNull()
    expect(validateInstagramAttachment(file('audio/x-m4a'))).toBeNull()
    expect(validateInstagramAttachment(file('video/quicktime'))).toBeNull()
  })

  it('recusa formato fora da allowlist', () => {
    expect(validateInstagramAttachment(file('audio/webm'))).toBe('formato_nao_suportado_instagram')
    expect(validateInstagramAttachment(file('image/webp'))).toBe('formato_nao_suportado_instagram')
    expect(validateInstagramAttachment(file('video/3gpp'))).toBe('formato_nao_suportado_instagram')
    expect(validateInstagramAttachment(
      file('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    )).toBe('formato_nao_suportado_instagram')
  })

  it('recusa arquivo sem tipo', () => {
    expect(validateInstagramAttachment(file(''))).toBe('formato_nao_suportado_instagram')
  })

  it('imagem acima de 8 MB e grande demais', () => {
    expect(validateInstagramAttachment(file('image/png', 8 * MB))).toBeNull()
    expect(validateInstagramAttachment(file('image/png', 8 * MB + 1))).toBe('arquivo_muito_grande_instagram')
  })

  it('demais tipos acima de 25 MB sao grandes demais', () => {
    expect(validateInstagramAttachment(file('video/mp4', 25 * MB))).toBeNull()
    expect(validateInstagramAttachment(file('video/mp4', 25 * MB + 1))).toBe('arquivo_muito_grande_instagram')
    expect(validateInstagramAttachment(file('application/pdf', 26 * MB))).toBe('arquivo_muito_grande_instagram')
  })

  it('formato e checado antes do tamanho', () => {
    expect(validateInstagramAttachment(file('audio/webm', 30 * MB))).toBe('formato_nao_suportado_instagram')
  })

  it('normaliza caixa e parametros do mime', () => {
    expect(validateInstagramAttachment(file('Audio/MP4; codecs=mp4a.40.2'))).toBeNull()
  })
})
