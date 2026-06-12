import { create } from 'zustand'
import type { ConversationStatus } from '@/types/database'

interface InboxFilters {
  search: string
  status: ConversationStatus | 'all'
  assignedTo: string | 'mine' | 'all'
  sourceId: string | null
}

interface InboxState {
  selectedLeadId: string | null
  filters: InboxFilters
  unreadCount: number
  contactPanelOpen: boolean
  setSelectedLeadId: (id: string | null) => void
  setFilters: (f: Partial<InboxFilters>) => void
  setUnreadCount: (n: number) => void
  toggleContactPanel: () => void
  setContactPanelOpen: (open: boolean) => void
}

export const useInboxStore = create<InboxState>((set) => ({
  selectedLeadId: null,
  filters: {
    search: '',
    status: 'all',
    assignedTo: 'all',
    sourceId: null,
  },
  unreadCount: 0,
  contactPanelOpen: false,
  setSelectedLeadId: (id) => set({ selectedLeadId: id }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  setUnreadCount: (n) => set({ unreadCount: n }),
  toggleContactPanel: () => set((s) => ({ contactPanelOpen: !s.contactPanelOpen })),
  setContactPanelOpen: (open) => set({ contactPanelOpen: open }),
}))
