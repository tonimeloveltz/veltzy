import { useSyncExternalStore } from 'react'

// Corte alinhado ao breakpoint xl do Tailwind (min-width: 1280px), que e onde
// o painel de contato deixa de ser overlay e vira terceira coluna inline.
// Nao usa o use-mobile.ts porque aquele corta em lg (1024px): a secao 2.3 da
// Spec mede que em 1024px sobrariam 68px para o chat com o painel inline.
const PANEL_INLINE_QUERY = '(min-width: 1280px)'

const isSupported = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'

const subscribe = (onStoreChange: () => void) => {
  if (!isSupported()) return () => {}
  const mql = window.matchMedia(PANEL_INLINE_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

const getSnapshot = () => (isSupported() ? window.matchMedia(PANEL_INLINE_QUERY).matches : false)

const getServerSnapshot = () => false

/**
 * true quando a viewport comporta o painel de contato como coluna inline.
 *
 * Mesma tecnica do use-mobile.ts da Fase 1: useSyncExternalStore em vez de
 * useState + useEffect, para nao perder uma mudanca de viewport ocorrida entre
 * o render e a assinatura.
 */
export const useIsPanelInline = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
