// Razao de contraste WCAG 2.1 entre duas cores hex (#RRGGBB). Aviso abaixo de 4,5:1 (texto normal).

export const MIN_CONTRAST = 4.5
const HEX_RE = /^#[0-9a-fA-F]{6}$/

export const isHexColor = (v: string) => HEX_RE.test(v)

/** Cor do texto da pagina publica em cada tema (titulo e corpo). */
export const THEME_TEXT = { light: '#0F172A', dark: '#F8FAFC' } as const

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export const relativeLuminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** null quando alguma cor e invalida. */
export const contrastRatio = (a: string, b: string): number | null => {
  if (!isHexColor(a) || !isHexColor(b)) return null
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export const lowContrast = (a: string, b: string) => {
  const r = contrastRatio(a, b)
  return r !== null && r < MIN_CONTRAST
}
