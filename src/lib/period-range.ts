/**
 * Janela dos seletores de periodo (Dashboard e Negocios).
 *
 * PONTO UNICO DE VERDADE da janela: o recorte de contatos, o de negocios, as
 * faixas da curva (`buildTrendBuckets`) e a lista de Negocios derivam TODOS
 * daqui, de proposito. Se um deles calculasse a janela por conta propria, um
 * registro poderia entrar no numero grande do card e cair fora de toda faixa
 * (`indexOfBucket` devolve -1 e descarta em silencio): o numero e a curva
 * passariam a discordar sem erro nenhum aparecer.
 *
 * `days` identifica o PRESET escolhido, nao uma quantidade de dias: os tres
 * presets do seletor sao de CALENDARIO, como os rotulos prometem.
 * - `1` ("Hoje")   -> meia-noite local do dia corrente
 * - `7` ("Semana") -> domingo 00h da semana corrente
 * - `30` ("Mes")   -> dia 1 00h do mes corrente
 * - `undefined` ("Total") -> sem recorte
 *
 * Ou seja: dia 3 do mes, "Mes" olha 3 dias, nao 30, e o negocio fechado dia 28
 * do mes passado fica de fora. E o comportamento pedido: o rotulo diz "Mes",
 * nao "ultimos 30 dias".
 *
 * Valores acima de 31 continuam janela deslizante (`agora - days`), porque nao
 * vem do seletor e sim de chamadas internas que pedem um recorte em dias mesmo
 * (ex: `buildTrendBuckets(90, ...)`).
 *
 * Tudo em horario LOCAL: o codigo roda no browser da usuaria, entao "local" e
 * America/Sao_Paulo na pratica.
 */
export const periodStartMs = (days: number | undefined, now: number): number | null => {
  if (days === undefined) return null
  const d = new Date(now)
  if (days <= 1) return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  // `getDay()` = 0 no domingo, entao subtrair ele leva ao domingo da semana
  // corrente. `setDate` com valor negativo volta de mes sozinho.
  if (days <= 7) return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).getTime()
  if (days <= 31) return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  return now - days * 86400000
}

/** `periodStartMs` em ISO, que e a forma que as queries do Supabase pedem. */
export const periodStartIso = (days: number | undefined, now: number = Date.now()): string | null => {
  const start = periodStartMs(days, now)
  return start === null ? null : new Date(start).toISOString()
}

/**
 * Periodo anterior, para o badge de variacao.
 *
 * Compara TRECHO EQUIVALENTE, nao periodo cheio: no dia 3 do mes, "Mes" compara
 * os 3 dias corridos contra os 3 primeiros dias do mes passado. Comparar contra
 * o mes anterior inteiro deixaria o badge vermelho todo comeco de mes por
 * construcao, sem dizer nada sobre o desempenho.
 *
 * Excecao: "Hoje" compara contra ONTEM INTEIRO, comportamento que ja existia e
 * que nao faz parte desta mudanca.
 *
 * `null` = "Total", que nao tem periodo anterior nenhum.
 */
export const previousPeriodRange = (days: number | undefined, now: number): { start: number; end: number } | null => {
  const currentStart = periodStartMs(days, now)
  if (days === undefined || currentStart === null) return null

  const s = new Date(currentStart)
  if (days <= 1) {
    const start = new Date(s.getFullYear(), s.getMonth(), s.getDate() - 1).getTime()
    return { start, end: currentStart }
  }

  const elapsed = now - currentStart
  let start: number
  if (days <= 7) start = new Date(s.getFullYear(), s.getMonth(), s.getDate() - 7).getTime()
  else if (days <= 31) start = new Date(s.getFullYear(), s.getMonth() - 1, 1).getTime()
  else start = currentStart - days * 86400000

  // Fim do trecho equivalente, limitado ao inicio do periodo atual: mes curto
  // seguido de mes longo (fevereiro -> marco) senao invadiria o periodo atual e
  // contaria o mesmo registro dos dois lados.
  return { start, end: Math.min(start + elapsed, currentStart) }
}
