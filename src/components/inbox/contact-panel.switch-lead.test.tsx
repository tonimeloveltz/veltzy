import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

type UpdateLeadArgs = [companyId: string, leadId: string, payload: Record<string, unknown>]
const updateLeadService = vi.fn<(...args: UpdateLeadArgs) => Promise<object>>(async () => ({}))

vi.mock('@/services/leads.service', () => ({ updateLead: updateLeadService }))
vi.mock('@/hooks/use-leads', () => ({ useUpdateLead: () => ({ mutateAsync: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/use-lead-detail', () => ({ useLeadDetail: () => ({ data: undefined }) }))
vi.mock('@/hooks/use-lead-sources', () => ({ useLeadSources: () => ({ data: [] }) }))
vi.mock('@/hooks/use-team', () => ({ useTeamMembers: () => ({ data: [] }) }))
vi.mock('@/hooks/use-tasks', () => ({
  useLeadTasks: () => ({ data: [], isLoading: false }),
  useCompleteTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/use-roles', () => ({ useRoles: () => ({ isAdmin: true, isManager: false, roles: ['admin'] }) }))
vi.mock('@/hooks/use-whatsapp-status', () => ({ useWhatsAppStatus: () => ({ data: undefined }) }))
vi.mock('@/hooks/use-lead-tags', () => ({ useLeadTags: () => ({ data: [], getTagColor: () => undefined }) }))
vi.mock('@/hooks/use-create-lead-tag', () => ({ useCreateLeadTag: () => ({ mutate: vi.fn() }) }))
vi.mock('@/components/inbox/lead-deals-panel', () => ({ LeadDealsPanel: () => null }))
vi.mock('@/components/inbox/lead-cadence-panel', () => ({ LeadCadencePanel: () => null }))
vi.mock('@/components/tarefas/create-task-modal', () => ({ CreateTaskModal: () => null }))

const { useAuthStore } = await import('@/stores/auth.store')
const { ContactPanel } = await import('@/components/inbox/contact-panel')

const baseLead = {
  name: '', first_name: '', last_name: '', phone: '5511999990000', email: '', company_name: '',
  instagram_handle: '', linkedin_url: '', source_id: null, assigned_to: null, observations: '',
  temperature: 'warm', conversation_status: 'open', avatar_url: null,
}
type TestLead = typeof baseLead & { id: string; tags: string[] }
const LEAD_A: TestLead = { ...baseLead, id: 'lead-a', name: 'Contato A', first_name: 'Contato', last_name: 'A', tags: [] }
const LEAD_B: TestLead = { ...baseLead, id: 'lead-b', name: 'Contato B', first_name: 'Contato', last_name: 'B', tags: ['antiga-b'] }

const renderPanel = (lead: TestLead) => {
  const client = new QueryClient()
  const ui = (l: TestLead) => (
    <QueryClientProvider client={client}>
      <ContactPanel lead={l as never} />
    </QueryClientProvider>
  )
  const utils = render(ui(lead))
  return { ...utils, switchTo: (l: TestLead) => utils.rerender(ui(l)) }
}

// Regressao: tag adicionada sem clicar em Salvar ia para o contato SEGUINTE ao
// trocar de conversa. O flush da troca lia leadIdRef, que o render do contato
// novo ja tinha atualizado, junto com os valores do contato antigo.
describe('ContactPanel: troca de contato com edicao pendente', () => {
  beforeEach(() => {
    updateLeadService.mockClear()
    useAuthStore.setState({ company: { id: 'company-1' } as never })
  })

  it('grava a tag pendente no contato que estava aberto, nao no proximo', async () => {
    const { switchTo } = renderPanel(LEAD_A)

    const input = screen.getByPlaceholderText('Digite e pressione Enter')
    fireEvent.change(input, { target: { value: 'tag1' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await act(async () => { switchTo(LEAD_B) })

    const tagWrites = updateLeadService.mock.calls.filter(([, , payload]) => 'tags' in payload)
    expect(tagWrites).toHaveLength(1)
    expect(tagWrites[0]).toEqual(['company-1', 'lead-a', { tags: ['tag1'] }])
  })

  it('nao grava nada no contato novo quando nada foi editado', async () => {
    const { switchTo } = renderPanel(LEAD_A)
    await act(async () => { switchTo(LEAD_B) })
    expect(updateLeadService.mock.calls.some(([, id]) => id === 'lead-b')).toBe(false)
  })
})
