import { useSyncExternalStore } from 'react'

// Corte alinhado ao breakpoint lg do Tailwind (min-width: 1024px).
// 1023.98 evita que hook e classe utilitaria fiquem ambos ativos em 1024px.
const MOBILE_QUERY = '(max-width: 1023.98px)'

const isSupported = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'

const subscribe = (onStoreChange: () => void) => {
  if (!isSupported()) return () => {}
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

const getSnapshot = () => (isSupported() ? window.matchMedia(MOBILE_QUERY).matches : false)

const getServerSnapshot = () => false

/**
 * true quando a viewport esta abaixo de 1024px.
 *
 * useSyncExternalStore em vez de useState + useEffect: o React le o snapshot
 * depois de assinar, entao uma mudanca de viewport entre o render e a assinatura
 * nao se perde. Com useState isso exigiria um setState dentro do effect, que
 * dispara render em cascata (e a regra de lint do projeto).
 */
export const useIsMobile = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
