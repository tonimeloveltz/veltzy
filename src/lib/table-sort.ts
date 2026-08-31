export type SortDirection = 'asc' | 'desc'

export interface SortState<K extends string = string> {
  key: K
  direction: SortDirection
}

/** Valor comparavel de uma celula. `null` e `''` significam "vazio". */
export type SortValue = string | number | null | undefined

/**
 * `0` NAO e vazio. Em Contatos, `dealCount` e `ltv` valem 0 para contato sem
 * negocio, e 0 e um numero de verdade que participa da ordem. Por isso o teste e
 * explicito contra `null`/`undefined`/`''`, e nunca `!value`.
 */
const isEmpty = (value: SortValue): boolean => value == null || value === ''

/**
 * Ordena as linhas por um valor de celula. Nao muta o array recebido.
 *
 * Vazio vai sempre para o fim, nas DUAS direcoes: quem inverte a ordem quer
 * inverter os valores, nao trazer uma pilha de vazios para o topo.
 *
 * Empate preserva a ordem de entrada (`Array.prototype.sort` e estavel desde
 * ES2019), entao os empatados continuam na ordem que a query devolveu.
 */
export const sortRows = <T>(rows: T[], getValue: (row: T) => SortValue, direction: SortDirection): T[] => {
  const factor = direction === 'asc' ? 1 : -1

  // Copia antes de ordenar: `sort` ordena no lugar, e o array que chega aqui e o
  // memoizado da tela.
  return [...rows].sort((a, b) => {
    const valueA = getValue(a)
    const valueB = getValue(b)

    // `factor` fica fora deste bloco de proposito: e o que mantem o vazio no fim
    // tambem em `desc`.
    const emptyA = isEmpty(valueA)
    const emptyB = isEmpty(valueB)
    if (emptyA && emptyB) return 0
    if (emptyA) return 1
    if (emptyB) return -1

    // Numero compara por subtracao, nunca convertido para string.
    if (typeof valueA === 'number' && typeof valueB === 'number') {
      return (valueA - valueB) * factor
    }

    // `sensitivity: 'base'` ignora acento e caixa (senao "Avila" com acento cai
    // depois de "Zulmira"). `numeric: true` ordena numero embutido em texto de
    // forma humana ("Etapa 2" antes de "Etapa 10"), e e disso que a coluna
    // Pipeline · etapa depende.
    return String(valueA).localeCompare(String(valueB), 'pt-BR', { sensitivity: 'base', numeric: true }) * factor
  })
}
