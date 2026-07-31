import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeConfig } from '@/hooks/use-theme-config'
import { useThemeSettings, THEME_SETTINGS_KEY } from '@/hooks/use-theme-settings'
import { supabase, veltzy } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

const swatches = [
  { label: 'Veltzy', hsl: '158 64% 42%', hex: '#22a06b' },
  { label: 'Teal', hsl: '175 70% 40%', hex: '#1a9e8f' },
  { label: 'Azul', hsl: '217 91% 60%', hex: '#3b82f6' },
  { label: 'Indigo', hsl: '234 89% 63%', hex: '#4f46e5' },
  { label: 'Roxo', hsl: '271 81% 56%', hex: '#8b5cf6' },
  { label: 'Violeta', hsl: '293 69% 49%', hex: '#a855f7' },
  { label: 'Rosa', hsl: '330 81% 60%', hex: '#ec4899' },
  { label: 'Vermelho', hsl: '0 72% 51%', hex: '#ef4444' },
  { label: 'Laranja', hsl: '25 95% 53%', hex: '#f97316' },
  { label: 'Amber', hsl: '38 92% 50%', hex: '#f59e0b' },
  { label: 'Lima', hsl: '84 81% 44%', hex: '#65a30d' },
  { label: 'Ciano', hsl: '199 89% 48%', hex: '#0ea5e9' },
  { label: 'Slate', hsl: '215 20% 40%', hex: '#4b5e75' },
  { label: 'Zinc', hsl: '240 6% 35%', hex: '#52525b' },
]

const cardStyles = [
  { id: 'flat', label: 'Plano' },
  { id: 'elevated', label: 'Elevado' },
  { id: 'glass', label: 'Glass' },
]

const sidebarStyles = [
  { id: 'solid', label: 'Solido' },
  { id: 'glass', label: 'Glass' },
]

function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '158 64% 42%'
  const r = parseInt(result[1], 16) / 255
  const g = parseInt(result[2], 16) / 255
  const b = parseInt(result[3], 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

function hslToHex(hslStr: string): string {
  const parts = hslStr.match(/(\d+)\s+(\d+)%?\s+(\d+)%?/)
  if (!parts) return '#22a06b'
  const h = parseInt(parts[1]) / 360
  const s = parseInt(parts[2]) / 100
  const l = parseInt(parts[3]) / 100
  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

const ThemeCustomizer = () => {
  const company = useAuthStore((s) => s.company)
  const setCompany = useAuthStore((s) => s.setCompany)
  const companyId = company?.id
  const { theme, setTheme } = useThemeConfig()
  const { data: themeSettings } = useThemeSettings()
  const queryClient = useQueryClient()

  const initialHsl = company?.primary_color ?? '158 64% 42%'
  const [primaryHsl, setPrimaryHsl] = useState(initialHsl)
  const [primaryHex, setPrimaryHex] = useState(() => {
    const match = swatches.find((s) => s.hsl === initialHsl)
    return match ? match.hex : hslToHex(initialHsl)
  })
  // Valor salvo (query) e a base; override guarda a edicao local nao salva.
  const [cardStyleOverride, setCardStyleOverride] = useState<string | null>(null)
  const [sidebarStyleOverride, setSidebarStyleOverride] = useState<string | null>(null)
  const cardStyle = cardStyleOverride ?? themeSettings?.card_style ?? 'glass'
  const sidebarStyle = sidebarStyleOverride ?? themeSettings?.sidebar_style ?? 'solid'
  const [saving, setSaving] = useState(false)

  const applyPreview = (hsl: string, hex: string) => {
    setPrimaryHsl(hsl)
    setPrimaryHex(hex)
    const root = document.documentElement
    const isDark = root.classList.contains('dark')
    root.style.setProperty('--primary', hsl)
    root.style.setProperty('--ring', hsl)
    root.style.setProperty('--sidebar-primary', hsl)
    root.style.setProperty('--glow-primary', hsl)
    const match = hsl.match(/(\d+)\s+(\d+)%?\s+(\d+)%?/)
    if (match) {
      const [, h, s] = match.map(Number)
      root.style.setProperty('--accent-foreground', isDark ? `${h} ${s}% 58%` : `${h} ${s}% 32%`)
      if (!root.classList.contains('sand')) {
        root.style.setProperty('--accent', isDark ? `${h} ${Math.round(s * 0.1)}% 16%` : `${h} ${Math.round(s * 0.6)}% 94%`)
      }
    }
  }

  const handleColorPicker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value
    applyPreview(hexToHsl(hex), hex)
  }

  const handleHexInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value
    setPrimaryHex(hex)
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      applyPreview(hexToHsl(hex), hex)
    }
  }

  const handleSave = async () => {
    if (!companyId) return
    setSaving(true)
    try {
      await supabase.from('companies').update({ primary_color: primaryHsl }).eq('id', companyId)
      await veltzy().from('system_settings').upsert(
        { company_id: companyId, key: 'theme_config', value: { card_style: cardStyle, sidebar_style: sidebarStyle } },
        { onConflict: 'company_id,key' }
      )
      // Atualiza o store imediatamente para a cor nao reverter ao valor antigo
      // quando o efeito de tema reaplicar company.primary_color.
      if (company) {
        setCompany({ ...company, primary_color: primaryHsl })
      }
      queryClient.invalidateQueries({ queryKey: ['company'] })
      queryClient.invalidateQueries({ queryKey: [THEME_SETTINGS_KEY] })
      toast.success('Tema salvo!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    applyPreview('158 64% 42%', '#22a06b')
    setTheme('light')
    setCardStyleOverride('glass')
    setSidebarStyleOverride('solid')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aparencia</CardTitle>
        <CardDescription>Personalize o visual da sua empresa</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>Modo do Tema</Label>
          <div className="grid grid-cols-3 gap-3">
            {(['light', 'dark', 'sand'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  'rounded-xl border-2 p-4 text-center text-sm font-medium transition-smooth',
                  theme === t ? 'border-primary bg-primary/5' : 'border-border/30 hover:border-border'
                )}
              >
                {t === 'light' ? 'Claro' : t === 'dark' ? 'Escuro' : 'Areia'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Cor Primaria</Label>
          <div className="flex flex-wrap gap-2">
            {swatches.map((s) => {
              const isActive = primaryHsl === s.hsl
              return (
                <button
                  key={s.hsl}
                  onClick={() => applyPreview(s.hsl, s.hex)}
                  title={s.label}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full transition-all',
                    isActive
                      ? 'ring-2 ring-offset-2 ring-offset-background'
                      : 'hover:scale-110'
                  )}
                  style={{
                    backgroundColor: s.hex,
                    ...(isActive ? { boxShadow: `0 0 0 2px ${s.hex}` } : {}),
                  }}
                >
                  {isActive && <Check className="h-3.5 w-3.5 text-white drop-shadow-sm" />}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <input
              type="color"
              value={primaryHex}
              onChange={handleColorPicker}
              className="h-9 w-9 cursor-pointer rounded-lg border-0 bg-transparent"
            />
            <Input
              value={primaryHex}
              onChange={handleHexInput}
              placeholder="#000000"
              className="w-28 text-xs font-mono"
            />
            <span className="text-[11px] text-muted-foreground">
              Cor personalizada
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Estilo dos Cards</Label>
          <div className="flex gap-2">
            {cardStyles.map((s) => (
              <button
                key={s.id}
                onClick={() => setCardStyleOverride(s.id)}
                className={cn(
                  'rounded-lg border px-4 py-2 text-sm transition-smooth',
                  cardStyle === s.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border/30 text-muted-foreground hover:text-foreground'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Estilo da Sidebar</Label>
          <div className="flex gap-2">
            {sidebarStyles.map((s) => (
              <button
                key={s.id}
                onClick={() => setSidebarStyleOverride(s.id)}
                className={cn(
                  'rounded-lg border px-4 py-2 text-sm transition-smooth',
                  sidebarStyle === s.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border/30 text-muted-foreground hover:text-foreground'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Restaurar Padrao
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar Tema
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export { ThemeCustomizer }
