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

// --- Badge suave (fundo translucido da cor + texto da propria cor) ---

type Rgb = [number, number, number]

const hexToRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const rgbToHex = ([r, g, b]: Rgb): string =>
  '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')

/** a*(1-t) + b*t, canal a canal. */
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Opacidade do fundo da tag: ~12% no claro (light e sand), ~20% no escuro. */
export const TAG_BG_ALPHA = { light: 0.12, dark: 0.2 } as const

/**
 * Superficies onde a tag aparece, por modo (card, fundo da pagina). O texto
 * precisa de contraste AA (4.5:1) sobre o fundo translucido composto em todas.
 * light: card branco, background 98%, card e background do sand.
 * dark: background e card do dark.
 */
export const TAG_SURFACES = {
  light: ['#ffffff', '#fafafa', '#f3efe8', '#f7f4ef'],
  dark: ['#09090b', '#13131a'],
} as const

const AA = 4.5

export type TagMode = 'light' | 'dark'

/** Fundo composto da tag sobre uma superficie (o que o olho ve). */
export const compositeTagBackground = (hex: string, surface: string, mode: TagMode): string =>
  rgbToHex(mixRgb(hexToRgb(surface), hexToRgb(hex), TAG_BG_ALPHA[mode]))

/**
 * Texto da tag: a propria cor, escurecida (light) ou clareada (dark) no minimo
 * necessario para AA sobre o fundo composto em todas as superficies do modo.
 */
export const getTagTextColor = (hex: string, mode: TagMode): string => {
  const base = hexToRgb(hex)
  const target: Rgb = mode === 'light' ? [0, 0, 0] : [255, 255, 255]
  const backgrounds = TAG_SURFACES[mode].map((s) => compositeTagBackground(hex, s, mode))
  for (let step = 0; step <= 20; step++) {
    const candidate = rgbToHex(mixRgb(base, target, step / 20))
    if (backgrounds.every((bg) => contrastRatio(candidate, bg) >= AA)) return candidate
  }
  return rgbToHex(target)
}

/**
 * CSS vars do badge suave nos dois modos; a classe do TagBadge escolhe pelo
 * `dark:` (sand usa o modo claro). Sem borda, mesmo padrao do fallback
 * bg-primary/10 text-primary.
 */
export const getTagStyleVars = (hex: string): Record<string, string> => {
  const [r, g, b] = hexToRgb(hex)
  return {
    '--tag-bg': `rgb(${r} ${g} ${b} / ${TAG_BG_ALPHA.light})`,
    '--tag-bg-dark': `rgb(${r} ${g} ${b} / ${TAG_BG_ALPHA.dark})`,
    '--tag-fg': getTagTextColor(hex, 'light'),
    '--tag-fg-dark': getTagTextColor(hex, 'dark'),
  }
}
