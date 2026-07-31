// Montagem do array `components` no formato Graph (WhatsApp Cloud API) a partir
// dos campos estruturados do form. Extraido do cloud-api-templates-proxy pra
// permitir teste unitario (deno test). Ordem canonica: HEADER, BODY, FOOTER, BUTTONS.

export interface CreateInput {
  name?: string
  language?: string
  category?: string
  body?: { text: string; examples?: string[] }
  header?: { format: string; text: string }
  footer?: { text: string }
  buttons?: unknown[]
}

export function buildComponents(input: CreateInput): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = []

  if (input.header?.text) {
    components.push({ type: 'HEADER', format: input.header.format ?? 'TEXT', text: input.header.text })
  }

  const body: Record<string, unknown> = { type: 'BODY', text: input.body?.text ?? '' }
  if (input.body?.examples?.length) {
    body.example = { body_text: [input.body.examples] }
  }
  components.push(body)

  if (input.footer?.text) {
    components.push({ type: 'FOOTER', text: input.footer.text })
  }
  if (input.buttons?.length) {
    components.push({ type: 'BUTTONS', buttons: input.buttons })
  }

  return components
}
