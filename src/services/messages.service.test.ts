import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fila de respostas: cada .single()/.maybeSingle() consome a proxima.
let responseQueue: Array<{ data: unknown }> = []

function createChainable() {
  const self = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => responseQueue.shift() ?? { data: null }
      }
      return () => self
    },
  })
  return self
}

vi.mock('@/lib/supabase', () => {
  const chainable = createChainable()
  return { supabase: chainable, veltzy: () => chainable }
})

import { isWhatsAppConnected } from './messages.service'

describe('isWhatsAppConnected (gate do envio por provider)', () => {
  beforeEach(() => {
    responseQueue = []
  })

  it("waha: conectado (a validacao real da sessao acontece no backend)", async () => {
    responseQueue = [{ data: { active_whatsapp_provider: 'waha' } }]
    expect(await isWhatsAppConnected('c1')).toBe(true)
  })

  it('evolution: conectado', async () => {
    responseQueue = [{ data: { active_whatsapp_provider: 'evolution' } }]
    expect(await isWhatsAppConnected('c1')).toBe(true)
  })

  it('cloud_api: conectado', async () => {
    responseQueue = [{ data: { active_whatsapp_provider: 'cloud_api' } }]
    expect(await isWhatsAppConnected('c1')).toBe(true)
  })

  it('zapi com integracao connected: conectado', async () => {
    responseQueue = [
      { data: { active_whatsapp_provider: 'zapi' } }, // companies
      { data: { id: 'oauth-1' } },                     // oauth_integrations connected
    ]
    expect(await isWhatsAppConnected('c1')).toBe(true)
  })

  it('zapi sem integracao: desconectado', async () => {
    responseQueue = [
      { data: { active_whatsapp_provider: 'zapi' } }, // companies
      { data: null },                                  // oauth_integrations ausente
    ]
    expect(await isWhatsAppConnected('c1')).toBe(false)
  })

  it('provider ausente -> fallback zapi: desconectado sem integracao', async () => {
    responseQueue = [
      { data: {} },      // companies sem active_whatsapp_provider
      { data: null },    // oauth_integrations ausente
    ]
    expect(await isWhatsAppConnected('c1')).toBe(false)
  })
})
