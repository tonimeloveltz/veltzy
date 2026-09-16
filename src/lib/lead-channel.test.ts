import { describe, it, expect } from 'vitest'
import {
  decideOutboundChannel,
  instagramWindowRemainingMs,
  instagramWindowState,
  isInstagramConversation,
  isInstagramPlaceholderPhone,
  leadContactLabel,
  type OutboundChannelInput,
} from '@/lib/lead-channel'
import { leadDisplayName } from '@/lib/phone'

const NOW = new Date('2026-09-14T12:00:00Z')
const HOUR = 60 * 60 * 1000
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

const input = (overrides: Partial<OutboundChannelInput>): OutboundChannelInput => ({
  lastInboundSource: null,
  phone: null,
  instagramId: null,
  whatsAppConnected: false,
  instagramConnected: false,
  ...overrides,
})

describe('isInstagramPlaceholderPhone', () => {
  it('reconhece o placeholder ig_', () => {
    expect(isInstagramPlaceholderPhone('ig_17841400000000001')).toBe(true)
  })

  it('telefone real, vazio e nulo nao sao placeholder', () => {
    expect(isInstagramPlaceholderPhone('5511917162109')).toBe(false)
    expect(isInstagramPlaceholderPhone('')).toBe(false)
    expect(isInstagramPlaceholderPhone(null)).toBe(false)
  })
})

describe('leadContactLabel', () => {
  it('placeholder com handle vira @handle', () => {
    expect(leadContactLabel({ phone: 'ig_1', instagram_handle: 'loja' })).toBe('@loja')
    expect(leadContactLabel({ phone: 'ig_1', instagram_handle: '@loja' })).toBe('@loja')
  })

  it('placeholder sem handle vira Instagram', () => {
    expect(leadContactLabel({ phone: 'ig_1', instagram_handle: null })).toBe('Instagram')
    expect(leadContactLabel({ phone: 'ig_1' })).toBe('Instagram')
  })

  it('telefone real passa como veio', () => {
    expect(leadContactLabel({ phone: '5511917162109', instagram_handle: 'loja' })).toBe('5511917162109')
  })
})

describe('isInstagramConversation', () => {
  it('placeholder ou instagram_id sem telefone real', () => {
    expect(isInstagramConversation({ phone: 'ig_1', instagram_id: '1' })).toBe(true)
    expect(isInstagramConversation({ phone: '', instagram_id: '1' })).toBe(true)
  })

  it('telefone real e conversa de WhatsApp', () => {
    expect(isInstagramConversation({ phone: '5511917162109', instagram_id: '1' })).toBe(false)
    expect(isInstagramConversation({ phone: '5511917162109', instagram_id: null })).toBe(false)
  })
})

describe('instagramWindowState', () => {
  it('sem mensagem do contato: closed', () => {
    expect(instagramWindowState(null, NOW)).toBe('closed')
  })

  it('mensagem recente: open', () => {
    expect(instagramWindowState(ago(1 * HOUR), NOW)).toBe('open')
  })

  it('menos de 2h para fechar: closing', () => {
    expect(instagramWindowState(ago(23 * HOUR), NOW)).toBe('closing')
  })

  it('mais de 24h: closed', () => {
    expect(instagramWindowState(ago(25 * HOUR), NOW)).toBe('closed')
    expect(instagramWindowRemainingMs(ago(25 * HOUR), NOW)).toBe(0)
  })
})

describe('decideOutboundChannel', () => {
  it('regra 1: ultima mensagem do Instagram com conexao e instagram_id vai para instagram', () => {
    expect(decideOutboundChannel(input({
      lastInboundSource: 'instagram', phone: '5511917162109', instagramId: '1',
      whatsAppConnected: true, instagramConnected: true,
    }))).toBe('instagram')
  })

  it('regra 2: ultima mensagem do WhatsApp com telefone real e WhatsApp conectado vai para whatsapp', () => {
    expect(decideOutboundChannel(input({
      lastInboundSource: 'whatsapp', phone: '5511917162109', instagramId: '1',
      whatsAppConnected: true, instagramConnected: true,
    }))).toBe('whatsapp')
  })

  it('regra 3: sem historico, telefone real e WhatsApp conectado vai para whatsapp', () => {
    expect(decideOutboundChannel(input({ phone: '5511917162109', whatsAppConnected: true }))).toBe('whatsapp')
  })

  it('regra 4: sem telefone real, instagram_id e Instagram conectado vai para instagram', () => {
    expect(decideOutboundChannel(input({ phone: '', instagramId: '1', instagramConnected: true }))).toBe('instagram')
  })

  it('regra 5: nada disponivel vai para manual', () => {
    expect(decideOutboundChannel(input({ phone: 'ig_1', instagramId: '1' }))).toBe('manual')
  })

  it('bug atual: placeholder + WhatsApp conectado NUNCA vai para whatsapp', () => {
    expect(decideOutboundChannel(input({
      phone: 'ig_1', instagramId: '1', whatsAppConnected: true, instagramConnected: true,
    }))).toBe('instagram')
    expect(decideOutboundChannel(input({
      lastInboundSource: 'whatsapp', phone: 'ig_1', instagramId: '1', whatsAppConnected: true,
    }))).toBe('manual')
    expect(decideOutboundChannel(input({ phone: 'ig_1', whatsAppConnected: true }))).toBe('manual')
  })

  it('ultima mensagem do Instagram mas Instagram desconectado cai para o WhatsApp se houver telefone real', () => {
    expect(decideOutboundChannel(input({
      lastInboundSource: 'instagram', phone: '5511917162109', instagramId: '1', whatsAppConnected: true,
    }))).toBe('whatsapp')
  })
})

describe('leadDisplayName com placeholder do Instagram', () => {
  it('sem nome e placeholder: Contato do Instagram', () => {
    expect(leadDisplayName(null, 'ig_17841400000000001')).toBe('Contato do Instagram')
  })

  it('com nome: o nome', () => {
    expect(leadDisplayName('Maria', 'ig_1')).toBe('Maria')
  })
})
