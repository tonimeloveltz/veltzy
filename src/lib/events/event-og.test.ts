// Testa a Vercel Function api/event-og.ts (fora do src, o vitest so le src/**).
import { describe, expect, it } from 'vitest'
import { injectMeta, plainDescription } from '../../../api/event-og'

const HTML = `<html><head>
    <title>Veltzy - CRM</title>
    <meta property="og:title" content="Veltzy" />
    <meta property="og:url" content="https://app.veltzy.com.br" />
  </head><body></body></html>`

describe('event-og', () => {
  it('descricao sem Markdown e cortada em 160', () => {
    expect(plainDescription('## Agenda\n- **Café** e [link](https://x)\n<script>x</script>')).toBe('Agenda Café e link x')
    expect(plainDescription('a'.repeat(200))).toHaveLength(160)
    expect(plainDescription(null)).toBe('')
  })

  it('troca o titulo, tira as metas genericas e escapa', () => {
    const out = injectMeta(HTML, { title: 'Evento "A" <b>', description: 'Sobre', appearance: { banner_url: 'https://cdn/b.png' } }, 'https://app/e/a')
    expect(out).toContain('<title>Evento &quot;A&quot; &lt;b&gt;</title>')
    expect(out).toContain('<meta property="og:image" content="https://cdn/b.png" />')
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(out.match(/og:title/g)).toHaveLength(1)
    expect(out).not.toContain('app.veltzy.com.br')
  })

  it('sem banner usa o logo; sem os dois, nenhuma imagem', () => {
    expect(injectMeta(HTML, { title: 'E', description: null, appearance: { logo_url: 'https://cdn/l.png' } }, 'u')).toContain('og:image" content="https://cdn/l.png"')
    const none = injectMeta(HTML, { title: 'E', description: null }, 'u')
    expect(none).not.toContain('og:image')
    expect(none).toContain('twitter:card" content="summary"')
  })
})
