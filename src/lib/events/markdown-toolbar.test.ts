import { describe, expect, it } from 'vitest'
import { applyMarkdown } from './markdown-toolbar'

describe('applyMarkdown', () => {
  it('negrito envolve a selecao e seleciona o texto', () => {
    const r = applyMarkdown('ola mundo', 4, 9, 'bold')
    expect(r.text).toBe('ola **mundo**')
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe('mundo')
  })

  it('sem selecao insere um texto de exemplo', () => {
    expect(applyMarkdown('', 0, 0, 'italic').text).toBe('_texto em itálico_')
  })

  it('lista prefixa cada linha da selecao, sem duplicar', () => {
    expect(applyMarkdown('a\n- b\nc', 0, 7, 'list').text).toBe('- a\n- b\n- c')
  })

  it('titulo prefixa a linha do cursor', () => {
    expect(applyMarkdown('um\ndois', 5, 5, 'heading').text).toBe('um\n## dois')
  })

  it('link usa a selecao como texto e seleciona a URL', () => {
    const r = applyMarkdown('veja aqui', 5, 9, 'link')
    expect(r.text).toBe('veja [aqui](https://)')
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe('https://')
  })
})
