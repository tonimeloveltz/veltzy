import type { AppRole, Company, CompanyOnboarding, WhatsAppProviderType, WhatsAppCategories } from '@/types/database'
import type { WhatsAppNumberItem } from '@/services/whatsapp-numbers.service'

// Empresas criadas antes disso nunca veem o wizard (PRD D4). Meia-noite em Sao Paulo.
export const ONBOARDING_CUTOFF = '2026-10-19T03:00:00Z'

export const getOnboardingFlags = (company: Company | null): CompanyOnboarding =>
  company?.metadata?.onboarding ?? {}

export const isOnboardingCandidate = (roles: AppRole[], company: Company | null): boolean => {
  if (!company) return false
  if (!roles.includes('admin') || roles.includes('super_admin')) return false
  if (new Date(company.created_at).getTime() < new Date(ONBOARDING_CUTOFF).getTime()) return false
  const flags = getOnboardingFlags(company)
  return !flags.skipped_at && !flags.completed_at
}

export const hasConnectedNumber = (numbers: WhatsAppNumberItem[]): boolean =>
  numbers.some((n) => n.status === 'connected')

export type QrProvider = 'waha' | 'evolution'

/**
 * O wizard so oferece conexao por QR Code. Escolhe o provider de QR liberado
 * no Hub, preferindo o que ja e o provider ativo da empresa. null = nenhum.
 */
export const pickQrProvider = (
  categories: WhatsAppCategories | null | undefined,
  activeProvider: WhatsAppProviderType | null | undefined,
): QrProvider | null => {
  const waha = !!categories?.waha
  const evolution = !!categories?.qr_code
  if (activeProvider === 'waha' && waha) return 'waha'
  if (activeProvider === 'evolution' && evolution) return 'evolution'
  if (waha) return 'waha'
  if (evolution) return 'evolution'
  return null
}
