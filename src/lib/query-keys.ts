import type { QueryClient } from '@tanstack/react-query'

/**
 * Fonte unica das queryKeys que derivam de `deals` e `leads`.
 *
 * As metricas do dashboard nao carregam 'deals'/'leads' como prefixo, entao a
 * invalidacao de ['deals'] emitida pelas mutacoes nao as alcanca por prefixo.
 * Elas precisam ser listadas nominalmente.
 */

/** Namespaces base. Alcancam por prefixo as queries de lista (kanban, dashboard, lead). */
export const BASE_QUERY_KEYS = ['deals', 'leads'] as const

/**
 * Metricas que refletem o estado presente: um unico deal/lead alterado ja muda
 * o numero na tela. Invalidadas na hora, a cada mutacao.
 */
export const ESTADO_ATUAL_QUERY_KEYS = [
  'dashboard-kpis',
  'dashboard-metrics',
  'dashboard-leads',
  'pipeline-overview',
  'leads-by-source',
  'seller-performance',
] as const

/**
 * Series historicas (90 dias, 6 meses). Um deal isolado nao move essas janelas
 * de forma perceptivel, e o fetch e caro. Ficam de fora da invalidacao imediata
 * das mutacoes e seguem no ritmo atual (realtime + refetchInterval de 60s).
 */
export const HISTORICO_QUERY_KEYS = [
  'historical-conversion-rates',
  'monthly-comparison-grid',
  'monthly-comparison',
] as const

/** Tudo que depende de deals/leads. Usado pelo realtime, que invalida sem economia. */
export const DASHBOARD_QUERY_KEYS = [
  ...BASE_QUERY_KEYS,
  ...ESTADO_ATUAL_QUERY_KEYS,
  // Fora de ESTADO_ATUAL de proposito: e a lista de fases do funil, que nao
  // muda quando um negocio e alterado. Invalidar a cada mutacao seria um select
  // desperdicado. Fica so aqui, no conjunto que o realtime varre.
  'dashboard-stages',
  ...HISTORICO_QUERY_KEYS,
] as const

/**
 * Invalida os deals e as metricas de estado presente que dependem deles.
 * Nao toca no grupo HISTORICO: ver comentario acima.
 */
export const invalidateDealDependentQueries = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ['deals'] })
  ESTADO_ATUAL_QUERY_KEYS.forEach((key) => {
    queryClient.invalidateQueries({ queryKey: [key] })
  })
}

/**
 * Mesma cobertura de metricas do helper de deals, mais o namespace `leads`.
 * Score Medio IA, Leads por Origem e a parte de leads do Proximas Acoes leem
 * dado de lead.
 */
export const invalidateLeadDependentQueries = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ['leads'] })
  invalidateDealDependentQueries(queryClient)
}
