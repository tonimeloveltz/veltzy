// WhatsApp de inscrito em evento: so celular (decisao do Toni, 18/11/2026).
// Regra extra so do fluxo de evento: o isValidPhoneBR compartilhado com o Inbox
// continua aceitando fixo.

import { isValidPhoneBR } from '../phone.ts'

export const isMobilePhoneBR = (value: string): boolean => {
  const digits = value.replace(/\D/g, '')
  const local = (digits.length === 12 || digits.length === 13) && digits.startsWith('55') ? digits.slice(2) : digits
  return isValidPhoneBR(value) && local.length === 11
}
