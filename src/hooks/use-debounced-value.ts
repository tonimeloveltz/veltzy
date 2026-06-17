import { useEffect, useState } from 'react'

/**
 * Retorna o valor com atraso (debounce) apos `delay` ms sem mudancas.
 * Util para busca textual: evita refiltrar a cada tecla.
 */
export const useDebouncedValue = <T>(value: T, delay = 200): T => {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])

  return debounced
}
