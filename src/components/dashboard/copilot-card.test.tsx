import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CopilotCard } from './copilot-card'
import { useSalesPulse } from '@/hooks/use-sales-pulse'

// O fallback (CopilotLocalTips) usa os hooks de dashboard: mockados vazios ->
// buildCopilotTips retorna [] -> renderiza "Tudo em dia" (card presente).
vi.mock('@/hooks/use-sales-pulse', () => ({ useSalesPulse: vi.fn() }))
vi.mock('@/hooks/use-dashboard-leads', () => ({ useDashboardLeads: () => ({ data: [], isLoading: false }) }))
vi.mock('@/hooks/use-dashboard-stages', () => ({ useDashboardStages: () => ({ data: [], isLoading: false }) }))
vi.mock('@/hooks/use-deals', () => ({ useDashboardDeals: () => ({ data: [], isLoading: false }) }))

const mockedPulse = useSalesPulse as unknown as Mock

const renderCard = () =>
  render(
    <MemoryRouter>
      <CopilotCard pipelineId={null} />
    </MemoryRouter>,
  )

describe('CopilotCard (hibrido IA + fallback heuristico)', () => {
  beforeEach(() => {
    mockedPulse.mockReset()
  })

  it('SEM acesso (data null): renderiza o fallback heuristico, card nunca some', () => {
    mockedPulse.mockReturnValue({ data: null, isLoading: false })
    renderCard()

    expect(screen.getByText('Copiloto')).toBeInTheDocument()
    // Fallback ativo: tips vazias -> "Tudo em dia".
    expect(screen.getByText('Tudo em dia')).toBeInTheDocument()
  })

  it('erro transitorio (hook degrada para null): tambem cai no fallback', () => {
    // O hook mapeia 403/rede/5xx/excecao para null; o card trata igual ao sem-acesso.
    mockedPulse.mockReturnValue({ data: null, isLoading: false })
    renderCard()

    expect(screen.getByText('Copiloto')).toBeInTheDocument()
    expect(screen.getByText('Tudo em dia')).toBeInTheDocument()
  })

  it('COM acesso (data IA): renderiza o conteudo IA (situacao/alertas/acoes)', () => {
    mockedPulse.mockReturnValue({
      data: {
        situacao: 'Resumo do dia com numeros reais',
        alertas: [{ tipo: 'urgente', texto: 'Lead Ana esta quente', lead_id: 'l1' }],
        acoes: [{ texto: 'Responder Bruno agora', lead_id: 'l2', destino: 'inbox' }],
      },
      isLoading: false,
    })
    renderCard()

    expect(screen.getByText('Copiloto')).toBeInTheDocument()
    expect(screen.getByText('Resumo do dia com numeros reais')).toBeInTheDocument()
    expect(screen.getByText('Lead Ana esta quente')).toBeInTheDocument()
    expect(screen.getByText('Responder Bruno agora')).toBeInTheDocument()
    // Nao cai no fallback quando ha IA.
    expect(screen.queryByText('Tudo em dia')).not.toBeInTheDocument()
  })

  it('loading da IA: renderiza skeleton (card presente)', () => {
    mockedPulse.mockReturnValue({ data: undefined, isLoading: true })
    const { container } = renderCard()

    expect(screen.getByText('Copiloto')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(screen.queryByText('Tudo em dia')).not.toBeInTheDocument()
  })
})
