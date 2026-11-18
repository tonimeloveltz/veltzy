// Espelho de supabase/functions/_shared/events/render.test.ts: os mesmos casos, o mesmo resultado.
import { describe, expect, it } from 'vitest'
import { formatEventDate, formatEventLocation, formatEventTime, OPT_OUT_FOOTER, renderEventMessage } from './render-message'

const TPL = 'Oi, {{primeiro_nome}}! {{evento}}\n📍 {{local}}\nLink: {{link_online}}\nDetalhes: {{link_inscricao}}'

describe('render-message (espelho do servidor)', () => {
  it('troca variaveis e mantem a linha do link online quando ha link', () => {
    const out = renderEventMessage(TPL, {
      primeiro_nome: 'Ana', evento: 'Workshop', local: 'Online',
      link_online: 'https://meet.x/abc', link_inscricao: 'https://app/e/w/i/t',
    })
    expect(out).toBe('Oi, Ana! Workshop\n📍 Online\nLink: https://meet.x/abc\nDetalhes: https://app/e/w/i/t' + OPT_OUT_FOOTER)
  })

  it('sem link online a linha inteira sai', () => {
    const out = renderEventMessage(TPL, { primeiro_nome: 'Ana', evento: 'W', local: 'Auditório', link_online: '', link_inscricao: 'u' })
    expect(out).toBe('Oi, Ana! W\n📍 Auditório\nDetalhes: u' + OPT_OUT_FOOTER)
  })

  it('rodape de descadastro sempre presente', () => {
    expect(renderEventMessage('', {})).toContain('responda SAIR.')
    expect(renderEventMessage('Oi {{desconhecida}}', {})).toBe('Oi' + OPT_OUT_FOOTER)
  })

  it('datas no fuso do evento', () => {
    const iso = '2026-11-28T01:30:00Z'
    expect(formatEventDate(iso, 'America/Sao_Paulo')).toBe('sex, 27 de nov')
    expect(formatEventTime(iso, 'America/Sao_Paulo')).toBe('22:30')
    expect(formatEventDate(iso, 'UTC')).toBe('sáb, 28 de nov')
    expect(formatEventTime('2026-11-28T12:00:00Z', 'America/Manaus')).toBe('08:00')
    expect(formatEventDate(null, 'America/Sao_Paulo')).toBe('')
  })

  it('local', () => {
    expect(formatEventLocation({ format: 'online', venue_name: 'X', street: null, number: null, district: null, city: null, state: null })).toBe('Online')
    expect(formatEventLocation({ format: 'presencial', venue_name: 'Auditório', street: 'Rua A', number: '10', district: null, city: 'São Paulo', state: 'SP' }))
      .toBe('Auditório - Rua A, 10 - São Paulo/SP')
  })
})
