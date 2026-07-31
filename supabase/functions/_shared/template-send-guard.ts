// Gate de envio de template (bloco b), parte PURA (sem supabase) pra teste unitario.
// So APPROVED envia; nº de parameters preenchidos == nº de {{n}} unicos do BODY.

export const TEMPLATE_BLOCK_MSG: Record<string, string> = {
  PENDING: 'Template ainda em analise pela Meta.',
  IN_REVIEW: 'Template ainda em analise pela Meta.',
  REJECTED: 'Template rejeitado pela Meta. Crie outro.',
  PAUSED: 'Template pausado pela Meta (qualidade). Escolha outro ou aguarde a reativacao.',
  DISABLED: 'Template desabilitado pela Meta (qualidade). Escolha outro.',
}

/** Conta {{n}} UNICOS no componente BODY dos components (Graph). */
export function countBodyVars(components: unknown): number {
  const body = Array.isArray(components)
    ? (components as Array<Record<string, unknown>>).find((c) => c?.type === 'BODY')
    : null
  const bodyText = typeof body?.text === 'string' ? (body.text as string) : ''
  return new Set([...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size
}

/**
 * Valida um template JA buscado (linha de whatsapp_templates) para envio.
 * Retorna string de erro amigavel, ou null se pode enviar.
 */
export function validateTemplateRow(
  row: { status?: string; components?: unknown } | null,
  parameterCount: number,
): string | null {
  if (!row) return 'Template nao encontrado. Sincronize os templates e tente novamente.'
  if (row.status !== 'APPROVED') {
    return TEMPLATE_BLOCK_MSG[row.status ?? ''] ?? 'Este template nao esta aprovado para envio.'
  }
  const varCount = countBodyVars(row.components)
  if (parameterCount !== varCount) {
    return `Preencha todas as ${varCount} variavel(is) do template antes de enviar.`
  }
  return null
}
