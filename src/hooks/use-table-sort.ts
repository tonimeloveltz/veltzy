import { useCallback, useState } from 'react'
import type { SortState } from '@/lib/table-sort'

/**
 * Estado de ordenacao de UMA tabela. Uma coluna por vez, sem persistencia: o
 * estado e local da pagina e volta ao padrao ao sair dela.
 */
export const useTableSort = <K extends string>() => {
  const [sort, setSort] = useState<SortState<K> | null>(null)

  const toggle = useCallback((key: K) => {
    setSort((current) => {
      // Coluna diferente: comeca em `asc` e zera a anterior.
      if (!current || current.key !== key) return { key, direction: 'asc' }
      // Mesma coluna: asc -> desc -> null. O `null` e a ordem padrao que veio da
      // query, e precisa ser alcancavel: e como o usuario desfaz a ordenacao.
      if (current.direction === 'asc') return { key, direction: 'desc' }
      return null
    })
  }, [])

  return { sort, toggle }
}
