import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const state = {
  deals: undefined as unknown[] | undefined,
  stages: undefined as unknown[] | undefined,
}

vi.mock('@/hooks/use-deals', () => ({
  useDealsByLead: () => ({ data: state.deals, isError: false }),
  useUpdateDeal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssignDeal: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDeal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-pipeline-stages', () => ({
  usePipelineStages: () => ({ data: state.stages }),
}))
vi.mock('@/hooks/use-leads', () => ({
  useUpdateLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-lead-sources', () => ({ useLeadSources: () => ({ data: [] }) }))
vi.mock('@/hooks/use-team', () => ({ useTeamMembers: () => ({ data: [] }) }))
vi.mock('@/hooks/use-roles', () => ({ useRoles: () => ({ isAdmin: true, isManager: false, roles: ['admin'] }) }))
vi.mock('@/hooks/use-tasks', () => ({
  useLeadTasks: () => ({ data: [] }),
  useCompleteTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/components/pipeline/deal-timeline', () => ({ DealTimeline: () => null }))

const { EditLeadModal } = await import('@/components/pipeline/edit-lead-modal')

const STAGE = { id: '11111111-1111-4111-8111-111111111111', name: 'Etapa A', pipeline_id: 'p1', color: '#000', position: 0 }
const DEAL = { id: 'd1', pipeline_id: 'p1', stage_id: STAGE.id, name: 'Negocio', value: 100, observations: '', assigned_to: null }
const LEAD = {
  id: 'l1', name: 'Fulano', phone: '5511999998888', email: '', company_name: '',
  source_id: null, observations: '', tags: [], instagram_handle: '', linkedin_url: '',
  temperature: 'warm',
}

// O trigger da Fase e o combobox dentro do bloco cujo Label diz "Fase".
const faseTrigger = () => {
  const label = screen.getAllByText('Fase').at(-1)!
  const box = label.parentElement!.querySelector('[role="combobox"]')
  if (!box) throw new Error('combobox da Fase nao encontrado')
  return box
}

const renderModal = () =>
  render(<EditLeadModal lead={LEAD as never} open onClose={() => {}} dealId="d1" />)

// Regressao: a Fase abria vazia na primeira abertura do card e certa na
// segunda. O Select vive na secao condicional a `activeDeal`; quando `deals`
// chegava depois, o Controller se registrava no mesmo commit do reset() e o
// react-hook-form nao o notificava. Os quatro cenarios cobrem as ordens de
// chegada de `deals` e `stages` - antes do fix, os dois com `deals` atrasado
// falhavam.
describe('EditLeadModal: preenchimento da Fase', () => {
  beforeEach(() => { state.deals = undefined; state.stages = undefined })

  const rerenderModal = (rerender: (ui: React.ReactElement) => void) =>
    rerender(<EditLeadModal lead={LEAD as never} open onClose={() => {}} dealId="d1" />)

  it('negocios e etapas ja em cache (segunda abertura)', async () => {
    state.deals = [DEAL]; state.stages = [STAGE]
    await act(async () => { renderModal() })
    expect(faseTrigger().textContent).toBe('Etapa A')
  })

  it('etapas em cache, negocios chegam depois', async () => {
    state.stages = [STAGE]
    const { rerender } = renderModal()
    await act(async () => { state.deals = [DEAL]; rerenderModal(rerender) })
    expect(faseTrigger().textContent).toBe('Etapa A')
  })

  it('negocios em cache, etapas chegam depois', async () => {
    state.deals = [DEAL]
    const { rerender } = renderModal()
    await act(async () => { state.stages = [STAGE]; rerenderModal(rerender) })
    expect(faseTrigger().textContent).toBe('Etapa A')
  })

  it('negocios e etapas chegam depois (primeira abertura)', async () => {
    const { rerender } = renderModal()
    await act(async () => { state.deals = [DEAL]; state.stages = [STAGE]; rerenderModal(rerender) })
    expect(faseTrigger().textContent).toBe('Etapa A')
  })
})
