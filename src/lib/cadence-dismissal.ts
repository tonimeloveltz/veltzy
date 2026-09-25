// Dispensa do aviso de cadencia ("Agora nao"), por lead e por dia.
//
// Separado de contact-cadence.ts de proposito: aquele modulo e puro e toda a
// aritmetica de D+N vive la. Este toca localStorage, entao nao e puro e nao
// deve contaminar o calculo.
//
// A dispensa e POR NAVEGADOR: dispensar no desktop nao dispensa no celular.
// Aceito, porque e lembrete. O outro lado do dedupe -- "ja registrou contato
// hoje" -- tem lastro no banco e vale em qualquer dispositivo, entao quem
// REGISTRA pela faixa nao passa por aqui.
//
// Sem rotina de limpeza: as chaves sao datadas e param de casar sozinhas no dia
// seguinte. Sao dezenas de bytes por lead por dia; varrer o storage para
// apaga-las custaria mais do que deixa-las.

import { spDateKey } from '@/lib/contact-cadence'

const PREFIX = 'veltzy:cadence-dismissed'

export const dismissalKey = (leadId: string, now: Date = new Date()): string =>
  `${PREFIX}:${leadId}:${spDateKey(now)}`

/**
 * O aviso ja foi dispensado hoje para este lead NESTE navegador?
 *
 * localStorage lanca em janela anonima, com dados de site bloqueados ou com o
 * storage cheio. Em qualquer falha devolve false: o pior caso vira "o aviso
 * reaparece", nunca "a inbox quebra".
 */
export const isDismissedToday = (leadId: string, now: Date = new Date()): boolean => {
  try {
    return localStorage.getItem(dismissalKey(leadId, now)) !== null
  } catch {
    return false
  }
}

/** Marca a dispensa de hoje. No-op se o storage nao estiver disponivel. */
export const markDismissedToday = (leadId: string, now: Date = new Date()): void => {
  try {
    localStorage.setItem(dismissalKey(leadId, now), '1')
  } catch {
    // Sem storage o aviso volta no proximo envio. Nao ha o que fazer aqui, e
    // nao e motivo para quebrar o fluxo de envio de mensagem.
  }
}
