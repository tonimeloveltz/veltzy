import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth.store'

type Theme = 'light' | 'dark' | 'sand'

const THEME_KEY = 'veltzy-theme'
const THEME_CHANGE_EVENT = 'veltzy-theme-change'

const applyTheme = (theme: Theme) => {
  const root = document.documentElement
  root.classList.remove('dark', 'sand')
  if (theme !== 'light') {
    root.classList.add(theme)
  }
}

const PRIMARY_KEY = 'veltzy-primary'

// Vars derivadas da cor da marca aplicadas como inline style no <html>.
// Precisam ser limpas a cada troca de tema, senao o valor do tema anterior
// fica "preso" (ex: accent escuro do dark sobrevive ao trocar pro claro,
// fazendo texto escuro sumir no hover).
const PRIMARY_VARS = ['--primary', '--ring', '--sidebar-primary', '--glow-primary']
const ACCENT_VARS = ['--accent', '--accent-foreground']

function parseHsl(hslColor?: string): [number, number, number] | null {
  if (!hslColor) return null
  const match = hslColor.match(/(\d+)\s+(\d+)%?\s+(\d+)%?/)
  if (!match) return null
  const [, h, s, l] = match.map(Number)
  return [h, s, l]
}

const applyCompanyColors = (primaryColor?: string, secondaryColor?: string) => {
  const root = document.documentElement
  const isDark = root.classList.contains('dark')
  const isSand = root.classList.contains('sand')
  const hsl = parseHsl(primaryColor)

  // Sempre limpa os overrides antes de reaplicar — evita valores presos do tema anterior.
  PRIMARY_VARS.forEach((v) => root.style.removeProperty(v))
  ACCENT_VARS.forEach((v) => root.style.removeProperty(v))

  if (hsl) {
    const [h, s, l] = hsl
    // No dark, cores muito escuras precisam clarear pra ter contraste.
    const primary = isDark && l < 20 ? `${h} ${s}% 55%` : `${h} ${s}% ${l}%`
    PRIMARY_VARS.forEach((v) => root.style.setProperty(v, primary))

    // Accent tintado pela marca — sand mantem o tom de areia do stylesheet,
    // mas so no FUNDO. `--accent-foreground` e a cor do TEXTO no hover
    // (`hover:text-accent-foreground` nas variantes ghost e outline do Button) e
    // tem que seguir a marca nos tres temas: sem isso o sand fica preso no verde
    // hardcoded de `.sand` em globals.css, qualquer que seja a cor escolhida.
    if (!isSand) {
      root.style.setProperty('--accent', isDark ? `${h} ${Math.round(s * 0.1)}% 16%` : `${h} ${Math.round(s * 0.6)}% 94%`)
    }
    // A luminosidade acompanha o tema de proposito: 58% sobre o fundo escuro do
    // hover, 32% sobre o claro. Igualar os dois em 58% ja foi tentado e o texto
    // sumiu no light e no sand (1.4x de contraste com a marca verde padrao,
    // contra os 4.5x que a WCAG pede para texto normal).
    root.style.setProperty('--accent-foreground', isDark ? `${h} ${s}% 58%` : `${h} ${s}% 32%`)

    // Persiste pro script de pre-render (index.html) aplicar antes do React montar.
    localStorage.setItem(PRIMARY_KEY, primaryColor as string)
  } else {
    localStorage.removeItem(PRIMARY_KEY)
  }

  if (secondaryColor) {
    root.style.setProperty('--secondary', secondaryColor)
  } else {
    root.style.removeProperty('--secondary')
  }
}

const readTheme = (): Theme => (localStorage.getItem(THEME_KEY) as Theme) || 'dark'

export const useThemeConfig = () => {
  const company = useAuthStore((s) => s.company)
  const [theme, setThemeState] = useState<Theme>(readTheme)

  useEffect(() => {
    const handler = () => setThemeState(readTheme())
    window.addEventListener(THEME_CHANGE_EVENT, handler)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handler)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(THEME_KEY, next)
    applyTheme(next)
    if (company) {
      applyCompanyColors(company.primary_color, company.secondary_color)
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
  }, [company])

  const cycleTheme = useCallback(() => {
    const current = readTheme()
    const themes: Theme[] = ['light', 'dark', 'sand']
    const next = themes[(themes.indexOf(current) + 1) % themes.length]
    setTheme(next)
    return next
  }, [setTheme])

  useEffect(() => {
    applyTheme(readTheme())
  }, [])

  useEffect(() => {
    if (company) {
      applyCompanyColors(company.primary_color, company.secondary_color)
    }
  }, [company])

  return { theme, setTheme, cycleTheme }
}
