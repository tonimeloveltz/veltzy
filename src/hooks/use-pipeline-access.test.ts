import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const PIPELINES = [
  { id: 'p1', name: 'Comercial', is_default: true },
  { id: 'p2', name: 'Parcerias', is_default: false },
]

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ company: { id: 'c1' }, user: { id: 'u1' } }),
}))
const ALLOWED = ['p1']

vi.mock('@/hooks/use-roles', () => ({ useRoles: () => ({ isManager: false }) }))
vi.mock('@/hooks/use-pipelines', () => ({
  usePipelines: () => ({ data: PIPELINES, isLoading: false }),
}))
// Vendedor COM allowlist configurada: e o unico caminho que derivava um array novo.
// `ALLOWED` e estavel de proposito - o React Query devolve a mesma referencia de
// `data` entre renders, entao a instabilidade so pode nascer dentro do hook.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: ALLOWED, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

const { useAccessiblePipelines } = await import('@/hooks/use-pipeline-access')

// Regressao do React #185 em producao: um vendedor com allowlist de pipelines
// recebia um array novo a cada render, e o efeito de reset do NewDealModal (que
// tem `pipelines` nas deps) disparava em loop ao abrir "Novo Negocio".
describe('useAccessiblePipelines', () => {
  it('filtra pela allowlist', () => {
    const { result } = renderHook(() => useAccessiblePipelines())
    expect(result.current.data?.map((p) => p.id)).toEqual(['p1'])
  })

  it('mantem a mesma referencia de array entre renders', () => {
    const { result, rerender } = renderHook(() => useAccessiblePipelines())
    const first = result.current.data
    rerender()
    expect(result.current.data).toBe(first)
  })
})
