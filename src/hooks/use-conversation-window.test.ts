import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const { chain, setResult } = vi.hoisted(() => {
  let result: { data: unknown; error: unknown } = { data: null, error: null }
  const c: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'gt', 'limit']) {
    c[m] = vi.fn(() => c)
  }
  c.maybeSingle = vi.fn(() => Promise.resolve(result))
  return { chain: c, setResult: (r: { data: unknown; error: unknown }) => { result = r } }
})

vi.mock('@/lib/supabase', () => ({ veltzy: () => chain }))

import { useConversationWindow } from '@/hooks/use-conversation-window'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useConversationWindow', () => {
  beforeEach(() => {
    setResult({ data: null, error: null })
    vi.clearAllMocks()
  })

  it('ABERTA quando ha mensagem recente do contato', async () => {
    setResult({ data: { id: 'm1' }, error: null })
    const { result } = renderHook(() => useConversationWindow('lead1'), { wrapper })
    await waitFor(() => expect(result.current.data).toBe(true))
  })

  it('FECHADA quando nao ha mensagem elegivel', async () => {
    setResult({ data: null, error: null })
    const { result } = renderHook(() => useConversationWindow('lead1'), { wrapper })
    await waitFor(() => expect(result.current.data).toBe(false))
  })

  it('aplica os filtros da janela (is_history=false, sender_type=lead, created_at>corte)', async () => {
    setResult({ data: { id: 'm1' }, error: null })
    const { result } = renderHook(() => useConversationWindow('lead1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(chain.eq).toHaveBeenCalledWith('is_history', false)
    expect(chain.eq).toHaveBeenCalledWith('sender_type', 'lead')
    expect(chain.eq).toHaveBeenCalledWith('lead_id', 'lead1')
    expect(chain.gt).toHaveBeenCalledWith('created_at', expect.any(String))
  })
})
