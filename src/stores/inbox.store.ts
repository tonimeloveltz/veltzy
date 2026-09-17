import { create } from 'zustand'
import type { ConversationStatus } from '@/types/database'

interface InboxFilters {
  search: string
  status: ConversationStatus | 'all'
  assignedTo: string | 'mine' | 'all'
  sourceId: string | null
}

interface InboxState {
  filters: InboxFilters
  unreadCount: number
  contactPanelOpen: boolean | null
  /** Lead que acabou de receber envio humano. O CadenceNudgeBar decide se mostra o aviso. */
  cadenceNudgeLeadId: string | null
  setFilters: (f: Partial<InboxFilters>) => void
  setUnreadCount: (n: number) => void
  toggleContactPanel: (currentEffective: boolean) => void
  setContactPanelOpen: (open: boolean | null) => void
  requestCadenceNudge: (leadId: string) => void
  clearCadenceNudge: () => void
}

export const useInboxStore = create<InboxState>((set) => ({
  filters: {
    search: '',
    status: 'all',
    assignedTo: 'all',
    sourceId: null,
  },
  unreadCount: 0,
  contactPanelOpen: null,
  cadenceNudgeLeadId: null,
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  setUnreadCount: (n) => set({ unreadCount: n }),
  toggleContactPanel: (currentEffective) => set({ contactPanelOpen: !currentEffective }),
  setContactPanelOpen: (open) => set({ contactPanelOpen: open }),
  requestCadenceNudge: (leadId) => set({ cadenceNudgeLeadId: leadId }),
  clearCadenceNudge: () => set({ cadenceNudgeLeadId: null }),
}))
