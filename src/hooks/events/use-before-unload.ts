import { useEffect } from 'react'

/** Aviso nativo do navegador ao fechar ou recarregar a aba com alteracoes pendentes. */
export const useBeforeUnload = (active: boolean) => {
  useEffect(() => {
    if (!active) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])
}
