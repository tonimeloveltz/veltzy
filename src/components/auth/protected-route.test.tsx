import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import type { AppRole, Company } from '@/types/database'
import { ProtectedRoute } from './protected-route'
import { useAuthStore } from '@/stores/auth.store'
import { useFeatureFlagStatus } from '@/hooks/use-feature-flag'

// Isola o gate de flag: os testes controlam enabled/isLoading deterministicamente,
// sem tocar em React Query nem no Supabase.
vi.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: vi.fn(() => false),
  useFeatureFlagStatus: vi.fn(),
}))

const mockedStatus = useFeatureFlagStatus as unknown as Mock

const SDR_ROLES: AppRole[] = ['admin', 'manager', 'super_admin']

const setAuth = (roles: AppRole[]) => {
  useAuthStore.setState({
    isLoading: false,
    user: { id: 'u1' } as unknown as User,
    company: { id: 'c1' } as unknown as Company,
    roles,
    permissions: [],
  })
}

const renderAt = (element: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/protegida']}>
      <Routes>
        <Route path="/protegida" element={element} />
        <Route path="/dashboard" element={<div>PAGINA DASHBOARD</div>} />
        <Route path="/acesso-negado" element={<div>ACESSO NEGADO</div>} />
        <Route path="/auth" element={<div>PAGINA AUTH</div>} />
      </Routes>
    </MemoryRouter>,
  )

const CONTEUDO = <div>CONTEUDO PROTEGIDO</div>

describe('ProtectedRoute + requireFeature (gate SDR IA)', () => {
  beforeEach(() => {
    mockedStatus.mockReset()
  })

  it('role ok + flag ON: renderiza a pagina protegida', () => {
    setAuth(['manager'])
    mockedStatus.mockReturnValue({ enabled: true, isLoading: false })

    renderAt(
      <ProtectedRoute requireRole={SDR_ROLES} requireFeature="sdr_agent_v2">
        {CONTEUDO}
      </ProtectedRoute>,
    )

    expect(screen.getByText('CONTEUDO PROTEGIDO')).toBeInTheDocument()
  })

  it('role ok + flag OFF: redireciona (barrado na ROTA, nao dentro da pagina)', () => {
    setAuth(['manager'])
    mockedStatus.mockReturnValue({ enabled: false, isLoading: false })

    renderAt(
      <ProtectedRoute requireRole={SDR_ROLES} requireFeature="sdr_agent_v2">
        {CONTEUDO}
      </ProtectedRoute>,
    )

    expect(screen.getByText('PAGINA DASHBOARD')).toBeInTheDocument()
    expect(screen.queryByText('CONTEUDO PROTEGIDO')).not.toBeInTheDocument()
  })

  it('role ok + flag em LOADING: NAO redireciona (mostra loader), nao vaza conteudo', () => {
    setAuth(['manager'])
    mockedStatus.mockReturnValue({ enabled: false, isLoading: true })

    const { container } = renderAt(
      <ProtectedRoute requireRole={SDR_ROLES} requireFeature="sdr_agent_v2">
        {CONTEUDO}
      </ProtectedRoute>,
    )

    // Nem barra quem tem direito, nem libera o conteudo antes da flag resolver.
    expect(screen.queryByText('PAGINA DASHBOARD')).not.toBeInTheDocument()
    expect(screen.queryByText('CONTEUDO PROTEGIDO')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('role insuficiente: redireciona para acesso-negado independente da flag', () => {
    setAuth(['seller'])
    // Mesmo com a flag ON, a checagem de role vem antes e corta o fluxo.
    mockedStatus.mockReturnValue({ enabled: true, isLoading: false })

    renderAt(
      <ProtectedRoute requireRole={SDR_ROLES} requireFeature="sdr_agent_v2">
        {CONTEUDO}
      </ProtectedRoute>,
    )

    expect(screen.getByText('ACESSO NEGADO')).toBeInTheDocument()
    expect(screen.queryByText('CONTEUDO PROTEGIDO')).not.toBeInTheDocument()
    // O gate de role corta antes: o FeatureGate nem e montado.
    expect(mockedStatus).not.toHaveBeenCalled()
  })

  it('rota SEM requireFeature: comportamento inalterado (flag nunca consultada)', () => {
    setAuth(['manager'])

    renderAt(
      <ProtectedRoute requireRole={SDR_ROLES}>{CONTEUDO}</ProtectedRoute>,
    )

    expect(screen.getByText('CONTEUDO PROTEGIDO')).toBeInTheDocument()
    // Sem requireFeature, o FeatureGate nao e montado (rules-of-hooks preservadas).
    expect(mockedStatus).not.toHaveBeenCalled()
  })
})
