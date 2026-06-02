import { describe, it, expect, vi, beforeEach } from 'vitest'

// Responses queue - each .single() or .limit() call pops from here
let responseQueue: Array<{ data: unknown }> = []

function createChainable() {
  const chain: Record<string, unknown> = {}
  const self = new Proxy(chain, {
    get(_target, prop: string) {
      if (prop === 'single') return () => responseQueue.shift() ?? { data: null }
      if (prop === 'limit') return () => responseQueue.shift() ?? { data: null }
      // All other methods (from, select, eq, order) return self for chaining
      return () => self
    },
  })
  return self
}

vi.mock('@/lib/supabase', () => {
  const chainable = createChainable()
  return {
    supabase: chainable,
    veltzy: () => chainable,
  }
})

import { resolveWhatsAppInstance } from './leads.service'

describe('resolveWhatsAppInstance', () => {
  beforeEach(() => {
    responseQueue = []
  })

  it('retorna null quando empresa nao usa Evolution', async () => {
    responseQueue = [
      { data: { active_whatsapp_provider: 'zapi' } },
    ]

    const result = await resolveWhatsAppInstance('company-1', 'user-1', 'pipe-1')
    expect(result).toBeNull()
  })

  it('retorna default_whatsapp_instance do vendedor quando disponivel', async () => {
    responseQueue = [
      { data: { active_whatsapp_provider: 'evolution' } },
      { data: { default_whatsapp_instance: 'vendedor-instance' } },
    ]

    const result = await resolveWhatsAppInstance('company-1', 'user-1', 'pipe-1')
    expect(result).toBe('vendedor-instance')
  })

  it('retorna sdr_instance_name do pipeline quando vendedor nao tem instancia', async () => {
    responseQueue = [
      { data: { active_whatsapp_provider: 'evolution' } },
      { data: { default_whatsapp_instance: null } },
      { data: { sdr_instance_name: 'pipeline-sdr-instance' } },
    ]

    const result = await resolveWhatsAppInstance('company-1', 'user-1', 'pipe-1')
    expect(result).toBe('pipeline-sdr-instance')
  })

  it('retorna primeira instancia connected quando vendedor e pipeline nao tem', async () => {
    responseQueue = [
      { data: { active_whatsapp_provider: 'evolution' } },
      { data: { default_whatsapp_instance: null } },
      { data: { sdr_instance_name: null } },
      { data: [{ instance_name: 'fallback-instance' }] },
    ]

    const result = await resolveWhatsAppInstance('company-1', 'user-1', 'pipe-1')
    expect(result).toBe('fallback-instance')
  })

  it('retorna null quando nenhuma instancia disponivel', async () => {
    responseQueue = [
      { data: { active_whatsapp_provider: 'evolution' } },
      // sem assigned_to e sem pipeline_id -> pula direto para instances
      { data: [] },
    ]

    const result = await resolveWhatsAppInstance('company-1', null, null)
    expect(result).toBeNull()
  })
})
