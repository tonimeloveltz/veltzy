import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Company, Profile } from '@/types/database'
import { useSalesPulse } from './use-sales-pulse'
import { useAuthStore } from '@/stores/auth.store'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))

const mockedInvoke = supabase.functions.invoke as unknown as Mock

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

const AI_OK = { situacao: 'Resumo real', alertas: [], acoes: [] }

describe('useSalesPulse (contrato hibrido: falha -> null, sucesso -> data)', () => {
  beforeEach(() => {
    mockedInvoke.mockReset()
    sessionStorage.clear()
    useAuthStore.setState({
      company: { id: 'c1' } as unknown as Company,
      profile: { id: 'p1', name: 'Fulano' } as unknown as Profile,
      roles: ['admin'],
    })
  })

  it('sucesso: retorna o payload da IA', async () => {
    mockedInvoke.mockResolvedValue({ data: AI_OK, error: null })
    const { result } = renderHook(() => useSalesPulse(), { wrapper })

    await waitFor(() => expect(result.current.isFetched).toBe(true))
    expect(result.current.data).toEqual(AI_OK)
  })

  it('403 sem acesso (error retornado): degrada para null', async () => {
    mockedInvoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', message: '403' } })
    const { result } = renderHook(() => useSalesPulse(), { wrapper })

    await waitFor(() => expect(result.current.isFetched).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('erro de rede (invoke lanca excecao): degrada para null, nao quebra', async () => {
    mockedInvoke.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useSalesPulse(), { wrapper })

    await waitFor(() => expect(result.current.isFetched).toBe(true))
    expect(result.current.data).toBeNull()
    expect(result.current.isError).toBe(false)
  })

  it('resposta sem shape de IA (ok:false): degrada para null', async () => {
    mockedInvoke.mockResolvedValue({ data: { ok: false, error: { code: 'X' } }, error: null })
    const { result } = renderHook(() => useSalesPulse(), { wrapper })

    await waitFor(() => expect(result.current.isFetched).toBe(true))
    expect(result.current.data).toBeNull()
  })
})
