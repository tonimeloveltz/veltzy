/**
 * Normaliza telefone para formato brasileiro com código de país (55).
 *
 * '11917162109'        → '5511917162109'
 * '5511917162109'      → '5511917162109'
 * '(11) 91716-2109'    → '5511917162109'
 * '+55 11 91716-2109'  → '5511917162109'
 * ''                   → ''
 */
/**
 * Nome para exibicao do lead. Se name e vazio e phone tem >13 digitos (LID do Meta),
 * exibe "Contato WhatsApp" em vez do numero cru.
 */
export const leadDisplayName = (name: string | null | undefined, phone: string): string => {
  if (name) return name
  if (phone.length > 13) return 'Contato WhatsApp'
  return phone
}

export const normalizePhoneBR = (phone: string): string => {
  let digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  if (digits.length >= 10 && digits.length <= 11) {
    digits = '55' + digits
  }
  return digits
}
