/**
 * Nome para se dirigir ao lead em mensagens (ex: lembretes de reuniao):
 * first_name; senao a 1a palavra do name; senao '' (o chamador decide o
 * fallback, ex: 'cliente'). Placeholder (nome vazio, 'Contato ...', so
 * telefone) nunca vira saudacao. Mesma regra do split no banco
 * (veltzy.split_lead_name).
 */
export const leadGreetingName = (lead: { first_name?: string | null; name?: string | null } | null | undefined): string => {
  const first = lead?.first_name?.trim()
  if (first) return first
  const name = (lead?.name ?? '').replace(/\s+/g, ' ').trim()
  if (!name || /^contato /i.test(name) || /^[0-9+() -]+$/.test(name)) return ''
  return name.split(' ')[0]
}
