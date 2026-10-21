import { describe, it, expect } from 'vitest'
import { isOnboardingCandidate, hasConnectedNumber, pickQrProvider, ONBOARDING_CUTOFF } from '@/lib/onboarding'
import type { Company } from '@/types/database'
import type { WhatsAppNumberItem, WhatsAppNumberStatus } from '@/services/whatsapp-numbers.service'

const AFTER = '2026-10-20T12:00:00Z'
const BEFORE = '2026-10-18T12:00:00Z'

const company = (overrides: Partial<Company> = {}): Company => ({
  id: 'c1',
  name: 'Empresa',
  slug: 'empresa',
  logo_url: null,
  primary_color: '',
  secondary_color: '',
  features: {} as Company['features'],
  settings: {},
  metadata: {},
  whatsapp_categories: null,
  active_whatsapp_provider: null,
  is_active: true,
  created_at: AFTER,
  updated_at: AFTER,
  ...overrides,
})

const number = (status: WhatsAppNumberStatus): WhatsAppNumberItem => ({
  provider: 'waha',
  providerLabel: 'WAHA',
  displayNumber: null,
  status,
  ref: 's1',
  routingId: null,
  funnelName: null,
})

describe('isOnboardingCandidate', () => {
  it('admin, criada depois do corte, sem flags', () => {
    expect(isOnboardingCandidate(['admin'], company())).toBe(true)
  })

  it('admin, criada antes do corte', () => {
    expect(isOnboardingCandidate(['admin'], company({ created_at: BEFORE }))).toBe(false)
  })

  it('criada exatamente no corte conta como nova', () => {
    expect(isOnboardingCandidate(['admin'], company({ created_at: ONBOARDING_CUTOFF }))).toBe(true)
  })

  it('admin com skipped_at', () => {
    expect(isOnboardingCandidate(['admin'], company({ metadata: { onboarding: { skipped_at: AFTER } } }))).toBe(false)
  })

  it('admin com completed_at', () => {
    expect(isOnboardingCandidate(['admin'], company({ metadata: { onboarding: { completed_at: AFTER } } }))).toBe(false)
  })

  it('admin e super_admin', () => {
    expect(isOnboardingCandidate(['admin', 'super_admin'], company())).toBe(false)
  })

  it('seller', () => {
    expect(isOnboardingCandidate(['seller'], company())).toBe(false)
  })

  it('company null', () => {
    expect(isOnboardingCandidate(['admin'], null)).toBe(false)
  })

  it('metadata null nao lanca e segue as outras regras', () => {
    expect(isOnboardingCandidate(['admin'], company({ metadata: null }))).toBe(true)
    expect(isOnboardingCandidate(['admin'], company({ metadata: null, created_at: BEFORE }))).toBe(false)
  })
})

describe('hasConnectedNumber', () => {
  it('lista vazia', () => {
    expect(hasConnectedNumber([])).toBe(false)
  })

  it('so qr_pending e disconnected', () => {
    expect(hasConnectedNumber([number('qr_pending'), number('disconnected')])).toBe(false)
  })

  it('um connected', () => {
    expect(hasConnectedNumber([number('disconnected'), number('connected')])).toBe(true)
  })
})

describe('pickQrProvider', () => {
  const both = { official: true, qr_code: true, waha: true }

  it('prefere o provider ativo da empresa', () => {
    expect(pickQrProvider(both, 'evolution')).toBe('evolution')
    expect(pickQrProvider(both, 'waha')).toBe('waha')
  })

  it('sem provider ativo de QR, WAHA antes de Evolution', () => {
    expect(pickQrProvider(both, 'cloud_api')).toBe('waha')
    expect(pickQrProvider({ official: true, qr_code: true, waha: false }, null)).toBe('evolution')
  })

  it('provider ativo com categoria desligada cai no outro', () => {
    expect(pickQrProvider({ official: false, qr_code: true, waha: false }, 'waha')).toBe('evolution')
  })

  it('so API Oficial liberada', () => {
    expect(pickQrProvider({ official: true, qr_code: false, waha: false }, 'cloud_api')).toBeNull()
    expect(pickQrProvider(null, null)).toBeNull()
  })
})
