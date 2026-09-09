import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Radix (Select/Popover) usa ResizeObserver, ausente no jsdom.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const PID = '11111111-1111-4111-8111-111111111111'
const SID = '22222222-2222-4222-8222-222222222222'

// Reproduz o hook quebrado: `data` e um array novo a cada chamada, como o
// `.filter()` sem memo de useAccessiblePipelines fazia para vendedor com allowlist.
vi.mock('@/hooks/use-pipeline-access', () => ({
  useAccessiblePipelines: () => ({
    data: [{ id: PID, name: 'Comercial', is_default: true }],
  }),
}))
vi.mock('@/hooks/use-pipeline-stages', () => ({
  usePipelineStages: () => ({
    data: [{ id: SID, name: 'Inscrito', is_final: false, is_positive: null }],
  }),
}))
vi.mock('@/hooks/use-contacts', () => ({ useContacts: () => ({ data: [] }) }))
vi.mock('@/hooks/use-team', () => ({ useTeamMembers: () => ({ data: [] }) }))
vi.mock('@/hooks/use-deals', () => ({
  useCreateDeal: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/components/contacts/new-contact-modal', () => ({ NewContactModal: () => null }))

const { NewDealModal } = await import('@/components/deals/new-deal-modal')

// Regressao do minified React error #185 ("Maximum update depth exceeded")
// visto em producao ao clicar em "Novo Negocio".
describe('NewDealModal', () => {
  it('abre sem entrar em loop de render quando `pipelines` muda de referencia', () => {
    expect(() => render(<NewDealModal open onClose={() => {}} />)).not.toThrow()
    expect(screen.getByText('Novo Negocio')).toBeInTheDocument()
  })
})
