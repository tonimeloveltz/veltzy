import type { CSSProperties } from 'react'
import type { EventAppearance } from '@/types/events'
import { THEME_TEXT } from '@/lib/events/contrast'

// Variaveis de cor da pagina do evento (preview do editor e pagina publica, bloco e).
// O tema do evento redefine os tokens no proprio container, independente do tema do app.
// As cores do tenant (fundo, primaria, texto do botao) entram por style, como dado.

const VARS: Record<EventAppearance['theme'], Record<string, string>> = {
  light: {
    '--background': '0 0% 100%', '--foreground': '222 47% 11%', '--card': '0 0% 100%',
    '--card-foreground': '222 47% 11%', '--muted': '210 40% 96%', '--muted-foreground': '215 16% 40%',
    '--border': '214 32% 88%', '--input': '214 32% 85%',
  },
  dark: {
    '--background': '222 40% 16%', '--foreground': '210 40% 98%', '--card': '222 40% 14%',
    '--card-foreground': '210 40% 98%', '--muted': '217 33% 20%', '--muted-foreground': '215 20% 70%',
    '--border': '217 33% 26%', '--input': '217 33% 30%',
  },
}

export const eventPageStyle = (a: EventAppearance): CSSProperties =>
  ({ ...VARS[a.theme], backgroundColor: a.background_color, color: THEME_TEXT[a.theme] }) as CSSProperties

export const eventButtonStyle = (a: EventAppearance): CSSProperties =>
  ({ backgroundColor: a.primary_color, color: a.button_text_color })
