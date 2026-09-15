import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Company } from '@/types/database'
import { useWhatsAppStatus } from './use-whatsapp-status'
import { useAuthStore } from '@/stores/auth.store'

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

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

describe('useWhatsAppStatus - provider waha', () => {
  beforeEach(() => {
    responseQueue = []
    useAuthStore.setState({ company: { id: 'c1' } as unknown as Company })
  })

  it('waha com >=1 instancia connected -> connected:true', async () => {
    responseQueue = [
      { data: { active_whatsapp_provider: 'waha' } }, // companies.single()
      { data: { id: 'w1' } },                          // waha_instances.maybeSingle()
    ]
    const { result } = renderHook(() => useWhatsAppStatus(), { wrapper })
    await waitFor(() => expect(result.current.isFetched).toBe(true))
    expect(result.current.data).toEqual({ provider: 'waha', connected: true })
  })

  it('waha sem instancia connected -> connected:false (nao cai no fallback zapi)', async () => {
    responseQueue = [
      { data: { active_whatsapp_provider: 'waha' } }, // companies.single()
      { data: null },                                  // waha_instances.maybeSingle() -> nenhuma
    ]
    const { result } = renderHook(() => useWhatsAppStatus(), { wrapper })
    await waitFor(() => expect(result.current.isFetched).toBe(true))
    expect(result.current.data).toEqual({ provider: 'waha', connected: false })
  })
})
