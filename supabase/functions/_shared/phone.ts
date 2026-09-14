/**
 * Normaliza telefone para formato brasileiro com código de país (55).
 */
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

/**
 * Lead do Instagram tem phone = 'ig_<IGSID>' (placeholder, Instagram DM D4).
 * Nenhum caminho de envio de WhatsApp pode aceitar esse valor.
 */
export const isInstagramPlaceholderPhone = (phone: string | null | undefined): boolean =>
  !!phone && phone.startsWith('ig_')
