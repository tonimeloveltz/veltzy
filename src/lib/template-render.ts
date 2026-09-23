import type { TemplateComponent } from '@/types/whatsapp-template'

/**
 * Extrai o texto do componente BODY (com {{n}}) dos components Graph do template.
 * Espelha _shared/blast-render.ts do backend. '' se nao houver BODY.
 */
export function getTemplateBody(components: TemplateComponent[] | null | undefined): string {
  if (!Array.isArray(components)) return ''
  const body = components.find(
    (c) => typeof c?.type === 'string' && c.type.toUpperCase() === 'BODY',
  )
  const text = (body as { text?: unknown } | undefined)?.text
  return typeof text === 'string' ? text : ''
}

/**
 * Índices únicos das variáveis posicionais {{n}} de um texto, em ordem crescente.
 * Ex: "Ola {{1}}, {{2}} e de novo {{1}}" → ['1','2'].
 */
export function extractVariables(bodyText: string): string[] {
  const found = new Set<string>()
  for (const m of bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) found.add(m[1])
  return [...found].sort((a, b) => Number(a) - Number(b))
}
