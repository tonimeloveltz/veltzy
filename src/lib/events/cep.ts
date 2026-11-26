/** Mascara de CEP: so digitos, no maximo 8, hifen depois do quinto (00000-000). */
export const formatCep = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}
