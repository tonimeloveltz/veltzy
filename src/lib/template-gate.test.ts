import { describe, it, expect } from 'vitest'
import { computeTemplateGate } from '@/lib/template-gate'

describe('computeTemplateGate', () => {
  it('UTILITY/AUTH (nao marketing): sempre ready, sem CTA', () => {
    expect(computeTemplateGate({ isMarketing: false, hasConsent: false, consentLoading: false }))
      .toEqual({ marketingReady: true, showConsentCta: false })
    expect(computeTemplateGate({ isMarketing: false, hasConsent: false, consentLoading: true }))
      .toEqual({ marketingReady: true, showConsentCta: false })
  })

  it('MARKETING com consentimento: ready, sem CTA', () => {
    expect(computeTemplateGate({ isMarketing: true, hasConsent: true, consentLoading: false }))
      .toEqual({ marketingReady: true, showConsentCta: false })
  })

  it('MARKETING sem consentimento (ja sabido): NAO ready, mostra CTA', () => {
    expect(computeTemplateGate({ isMarketing: true, hasConsent: false, consentLoading: false }))
      .toEqual({ marketingReady: false, showConsentCta: true })
  })

  it('MARKETING durante loading: NAO ready (nao envia as cegas) e SEM CTA (nao pisca)', () => {
    expect(computeTemplateGate({ isMarketing: true, hasConsent: false, consentLoading: true }))
      .toEqual({ marketingReady: false, showConsentCta: false })
  })
})
