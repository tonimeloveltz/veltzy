/**
 * Extrai os indices de variavel {{n}} de um texto de template, UNICOS e ORDENADOS
 * (1..n). {{1}} repetido conta uma vez; {{2}} sem {{1}} vem como [2] (o chamador
 * decide se e sequencial). Base do form de criar (validacao) e do de enviar
 * (coleta de valores).
 */
export function extractTemplateVars(text: string): number[] {
  const found = new Set<number>()
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) {
    found.add(Number(m[1]))
  }
  return [...found].sort((a, b) => a - b)
}
