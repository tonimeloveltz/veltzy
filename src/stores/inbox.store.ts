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
  setFilters: (f: Partial<InboxFilters>) => void
  setUnreadCount: (n: number) => void
  toggleContactPanel: (currentEffective: boolean) => void
  setContactPanelOpen: (open: boolean | null) => void
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
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  setUnreadCount: (n) => set({ unreadCount: n }),
  toggleContactPanel: (currentEffective) => set({ contactPanelOpen: !currentEffective }),
  setContactPanelOpen: (open) => set({ contactPanelOpen: open }),
}))
