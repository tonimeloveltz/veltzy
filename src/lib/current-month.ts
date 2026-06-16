// Regra do board (kanban): negocios fechados (won/lost) so aparecem se o
// closed_at cair no mes corrente. Fechados de meses anteriores recolhem para o
// historico (somem do board, mas seguem em /deals e no contato).
//
// "Mes corrente" no fuso local America/Sao_Paulo: comparamos o ano-mes do
// closed_at com o ano-mes de agora, ambos formatados em SP. Formatar na timezone
// evita cortar/incluir errado deals fechados perto da virada (ex: um closed_at
// UTC que ainda e dia anterior em SP). Derivado da data atual a cada
// carregamento - sem cron, sem flag de arquivamento.

const SP_TZ = 'America/Sao_Paulo'

// "2026-06" para a data no fuso de Sao Paulo (en-CA -> YYYY-MM).
const spYearMonth = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ, year: 'numeric', month: '2-digit' }).format(date)

export const isClosedInCurrentMonth = (
  closedAt: string | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!closedAt) return false
  return spYearMonth(new Date(closedAt)) === spYearMonth(now)
}
