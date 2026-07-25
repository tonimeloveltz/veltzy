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

/** Mensagem unica de erro de telefone invalido (reutilizada nos schemas dos modais). */
export const PHONE_ERROR_MSG = 'Digite um telefone válido com DDD (celular ou fixo)'

/**
 * Extrai os digitos locais (DDD + numero, SEM o 55).
 * Remove tudo que nao e digito. Se sobrar 12 ou 13 digitos comecando em '55',
 * remove o 55 do inicio (codigo de pais). Numeros locais tem 10 ou 11 digitos.
 * Nunca lanca. Ex.: '+55 (11) 91716-2109' -> '11917162109'; '1133334444' -> '1133334444'.
 */
const toLocalDigits = (value: string): string => {
  let digits = value.replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2)
  }
  return digits
}

/**
 * Valida telefone brasileiro. Aceita entrada com ou sem o 55 na frente e com ou
 * sem mascara (normaliza antes de checar). Regras:
 *   - DDD deve estar em DDDS_VALIDOS
 *   - celular: 9 digitos, comecando em 9
 *   - fixo:    8 digitos, comecando em 2, 3, 4 ou 5
 * String vazia (ou sem digitos) e invalida.
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

/**
 * Mascara visual de telefone BR. NUNCA lanca. Recebe qualquer string (mascarada,
 * so digitos, com/sem 55, incompleta ou vazia) e devolve a melhor mascara possivel.
 * Usada tanto na digitacao (parcial) quanto para exibir valor salvo no EditLeadModal.
 * Se nao der para mascarar, devolve os digitos crus.
 */
export const formatPhoneBR = (value: string): string => {
  const d = toLocalDigits(value).slice(0, 11)
  const n = d.length
  if (n === 0) return ''
  if (n <= 2) return `(${d}`
  if (n <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (n <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
