/**
 * Regra do gate de MARKETING no envio de template (LGPD, bloqueante Fase 1).
 * Separa "pode enviar" de "mostrar CTA de opt-in":
 * - marketingReady: MARKETING so libera com consentimento PRESENTE. Bloqueia
 *   INCLUSIVE durante o loading do consent (pra nao enviar as cegas). UTILITY/
 *   AUTH nao passam pelo gate (sempre ready).
 * - showConsentCta: banner/CTA de opt-in aparece so quando JA sabemos que nao ha
 *   consentimento (nao durante o loading, pra nao piscar).
 */
export interface TemplateGateInput {
  isMarketing: boolean
  hasConsent: boolean
  consentLoading: boolean
}

export interface TemplateGateResult {
  marketingReady: boolean
  showConsentCta: boolean
}

export function computeTemplateGate(input: TemplateGateInput): TemplateGateResult {
  const { isMarketing, hasConsent, consentLoading } = input
  return {
    marketingReady: !isMarketing || hasConsent,
    showConsentCta: isMarketing && !hasConsent && !consentLoading,
  }
}
