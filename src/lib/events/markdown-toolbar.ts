// Acoes da barra da descricao: inserem Markdown na selecao do textarea (D10).

export type MarkdownAction = 'bold' | 'italic' | 'heading' | 'list' | 'link'

export interface TextEdit {
  text: string
  selectionStart: number
  selectionEnd: number
}

const wrap = (t: string, start: number, end: number, before: string, after: string, fallback: string): TextEdit => {
  const selected = t.slice(start, end) || fallback
  const text = t.slice(0, start) + before + selected + after + t.slice(end)
  return { text, selectionStart: start + before.length, selectionEnd: start + before.length + selected.length }
}

/** Prefixa cada linha tocada pela selecao (titulo e lista). */
const prefixLines = (t: string, start: number, end: number, prefix: string): TextEdit => {
  const lineStart = t.lastIndexOf('\n', start - 1) + 1
  const block = t.slice(lineStart, end)
  const lines = block.split('\n').map((l) => (l.startsWith(prefix) ? l : prefix + l))
  const replaced = lines.join('\n')
  const text = t.slice(0, lineStart) + replaced + t.slice(end)
  return { text, selectionStart: lineStart + prefix.length, selectionEnd: lineStart + replaced.length }
}

export const applyMarkdown = (t: string, start: number, end: number, action: MarkdownAction): TextEdit => {
  switch (action) {
    case 'bold': return wrap(t, start, end, '**', '**', 'texto em negrito')
    case 'italic': return wrap(t, start, end, '_', '_', 'texto em itálico')
    case 'heading': return prefixLines(t, start, end, '## ')
    case 'list': return prefixLines(t, start, end, '- ')
    case 'link': {
      const label = t.slice(start, end) || 'texto do link'
      const before = `[${label}](`
      const url = 'https://'
      const text = t.slice(0, start) + before + url + ')' + t.slice(end)
      const at = start + before.length
      return { text, selectionStart: at, selectionEnd: at + url.length }
    }
  }
}
