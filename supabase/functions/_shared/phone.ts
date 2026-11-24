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

// Copia EXATA de src/lib/phone.ts (DDDS_VALIDOS, toLocalDigits, isValidPhoneBR):
// o servidor valida com a mesma regra do front. Mudou la, muda aqui.

/** DDDs brasileiros que realmente existem. Lista fechada: faixa 11-99 NAO serve. */
export const DDDS_VALIDOS: ReadonlySet<string> = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
])

const toLocalDigits = (value: string): string => {
  let digits = value.replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2)
  }
  return digits
}

/**
 * Valida telefone brasileiro. Aceita entrada com ou sem o 55 na frente e com ou
 * sem mascara. DDD em DDDS_VALIDOS; celular: 9 digitos comecando em 9;
 * fixo: 8 digitos comecando em 2, 3, 4 ou 5. Vazio e invalido.
 */
export const isValidPhoneBR = (value: string): boolean => {
  const local = toLocalDigits(value)
  if (local === '') return false
  const ddd = local.slice(0, 2)
  if (!DDDS_VALIDOS.has(ddd)) return false
  const sub = local.slice(2)
  const celular = sub.length === 9 && sub[0] === '9'
  const fixo = sub.length === 8 && ['2', '3', '4', '5'].includes(sub[0])
  return celular || fixo
}
