import { describe, it, expect, beforeEach } from 'vitest'
import { useInboxStore } from './inbox.store'

describe('inbox.store - contactPanel', () => {
  beforeEach(() => {
    useInboxStore.setState({ contactPanelOpen: null })
  })

  it('contactPanelOpen inicia como null (segue o viewport)', () => {
    useInboxStore.setState({ contactPanelOpen: null })
    expect(useInboxStore.getState().contactPanelOpen).toBeNull()
  })

  it('toggleContactPanel inverte o valor efetivo recebido', () => {
    const { toggleContactPanel } = useInboxStore.getState()
    toggleContactPanel(false)
    expect(useInboxStore.getState().contactPanelOpen).toBe(true)
    toggleContactPanel(true)
    expect(useInboxStore.getState().contactPanelOpen).toBe(false)
  })

  it('setContactPanelOpen define valor explicitamente', () => {
    const { setContactPanelOpen } = useInboxStore.getState()
    setContactPanelOpen(true)
    expect(useInboxStore.getState().contactPanelOpen).toBe(true)
    setContactPanelOpen(false)
    expect(useInboxStore.getState().contactPanelOpen).toBe(false)
  })
})
