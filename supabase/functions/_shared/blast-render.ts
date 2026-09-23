// Renderizacao de template p/ disparo em massa (mkt-ativo · §3 da SPEC).
// Logica PURA e testavel. Fase 1: WAHA/Evolution enviam o BODY do template
// renderizado como TEXTO (nao ha HSM aprovado nesses canais). O resolver e
// POSICIONAL ({{1}}, {{2}}...) alimentado pelo variable_mapping da campanha +
// dados do lead no momento do disparo.

// Componente cru da Graph (mesma forma do type WhatsAppTemplate.components).
export interface TemplateComponent {
  type: string
  text?: string
  [key: string]: unknown
}

/**
 * Extrai o texto do componente BODY (com {{n}}) de um array de components Graph.
 * Case-insensitive no type; ignora HEADER/FOOTER/BUTTONS. '' se nao houver BODY.
 */
export function getTemplateBodyText(components: TemplateComponent[] | null | undefined): string {
  if (!Array.isArray(components)) return ''
  const body = components.find((c) => typeof c?.type === 'string' && c.type.toUpperCase() === 'BODY')
  return typeof body?.text === 'string' ? body.text : ''
}

/**
 * Resolve um valor do mapping. "lead.<campo>" → lead[campo]; qualquer outra
 * string → literal fixo. Valor ausente/nulo → ''.
 */
function resolveValue(raw: string | undefined, lead: Record<string, unknown>): string {
  if (raw == null) return ''
  if (raw.startsWith('lead.')) {
    const field = raw.slice('lead.'.length)
    const v = lead[field]
    return v == null ? '' : String(v)
  }
  return raw
}

/**
 * Renderiza o body substituindo {{n}} pelo valor de variable_mapping[n] resolvido
 * contra o lead. Indice sem mapping → '' (nunca deixa {{n}} cru vazando no envio).
 */
export function renderTemplateBody(
  bodyText: string,
  variableMapping: Record<string, string> | null | undefined,
  lead: Record<string, unknown>,
): string {
  const mapping = variableMapping ?? {}
  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, idx: string) => resolveValue(mapping[idx], lead))
}

/**
 * Resolve os PARAMETROS posicionais de um template (Cloud API HSM), em ordem
 * crescente das variaveis {{n}} do body. Diferente de renderTemplateBody (que
 * devolve texto), aqui devolve o ARRAY de valores — o payload de template da Meta
 * leva os parametros separados, nao o texto final. Indice sem mapping → ''.
 */
export function resolveTemplateParams(
  bodyText: string,
  variableMapping: Record<string, string> | null | undefined,
  lead: Record<string, unknown>,
): string[] {
  const mapping = variableMapping ?? {}
  const indices = new Set<string>()
  for (const m of bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) indices.add(m[1])
  return [...indices].sort((a, b) => Number(a) - Number(b)).map((idx) => resolveValue(mapping[idx], lead))
}
