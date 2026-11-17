import { useAuthStore } from '@/stores/auth.store'

/** Fonte unica da feature: companies.features.veltzy_events (a mesma do menu). */
export const useEventsEnabled = (): boolean =>
  useAuthStore((s) => s.company?.features?.veltzy_events) === true
