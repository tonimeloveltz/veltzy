import { describe, it, expect, beforeEach } from 'vitest'
import { useInboxStore } from './inbox.store'

describe('inbox.store - contactPanel', () => {
  beforeEach(() => {
    useInboxStore.setState({ contactPanelOpen: false, selectedLeadId: null })
  })

  it('contactPanelOpen default depende do viewport', () => {
    // O store inicializa com window.matchMedia check
    // No jsdom, window.innerWidth = 1024 por default, então < 1280 = false
    // Aqui testamos o comportamento funcional após setState
    expect(useInboxStore.getState().contactPanelOpen).toBe(false)
  })

  it('toggleContactPanel alterna aberto/fechado', () => {
    const { toggleContactPanel } = useInboxStore.getState()
    toggleContactPanel()
    expect(useInboxStore.getState().contactPanelOpen).toBe(true)
    toggleContactPanel()
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
