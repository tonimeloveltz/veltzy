/**
 * Cores de tag escolhidas pelo usuario.
 *
 * A cor escolhida vira dado (veltzy.lead_tags.color) e e aplicada via `style`,
 * mesmo padrao de lead_sources.color e pipeline_stages.color. As opcoes do
 * seletor sao a PALETTE de shared/color-picker. Tag sem cor usa os tokens do tema.
 */
export const DEFAULT_NEW_TAG_COLOR = '#3b82f6'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export const isValidTagColor = (color: string): boolean => HEX_COLOR.test(color)

/** Chave de comparacao: o catalogo casa nome sem diferenciar maiuscula/minuscula. */
export const normalizeTagKey = (name: string): string => name.trim().toLowerCase()

const channelToLinear = (channel: number): number => {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const relativeLuminance = (hex: string): number => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
}

export const TAG_TEXT_DARK = '#111827'
export const TAG_TEXT_LIGHT = '#FFFFFF'

/** Texto claro ou escuro, o que der mais contraste (WCAG) sobre o fundo escolhido. */
export const getReadableTextColor = (hex: string): string => {
  if (!isValidTagColor(hex)) return TAG_TEXT_DARK
  const l = relativeLuminance(hex)
  const contrastWithDark = (l + 0.05) / (relativeLuminance(TAG_TEXT_DARK) + 0.05)
  const contrastWithLight = 1.05 / (l + 0.05)
  return contrastWithDark >= contrastWithLight ? TAG_TEXT_DARK : TAG_TEXT_LIGHT
}
