/**
 * Hash determinístico de string → índice de cor.
 * Mesma tag = mesma cor, em qualquer tela.
 */
const hashString = (str: string): number => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/**
 * Paleta de 8 pares pastel.
 * bg: cor suave (light) / translúcida (dark via /15)
 * text: matiz escuro (light) / claro (dark via -300 equiv)
 *
 * Usa Tailwind arbitrary values com cores HSL para AA contrast nos dois temas.
 */
const palette = [
  { bg: 'bg-blue-100 dark:bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-violet-100 dark:bg-violet-500/15', text: 'text-violet-700 dark:text-violet-300' },
  { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300' },
  { bg: 'bg-rose-100 dark:bg-rose-500/15', text: 'text-rose-700 dark:text-rose-300' },
  { bg: 'bg-cyan-100 dark:bg-cyan-500/15', text: 'text-cyan-700 dark:text-cyan-300' },
  { bg: 'bg-orange-100 dark:bg-orange-500/15', text: 'text-orange-700 dark:text-orange-300' },
  { bg: 'bg-fuchsia-100 dark:bg-fuchsia-500/15', text: 'text-fuchsia-700 dark:text-fuchsia-300' },
] as const

/**
 * Retorna classes Tailwind de bg + text para uma tag.
 * Determinístico: mesma string → mesma cor.
 */
export const tagColor = (tag: string): { bg: string; text: string } => {
  const idx = hashString(tag.toLowerCase().trim()) % palette.length
  return palette[idx]
}
