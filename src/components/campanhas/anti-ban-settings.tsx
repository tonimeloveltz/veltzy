import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ThrottleConfig } from '@/types/database'

interface AntiBanSettingsProps {
  value: ThrottleConfig | null
  onChange: (next: ThrottleConfig) => void
}

// Defaults do servidor (SYSTEM_THROTTLE_DEFAULTS em _shared/blast-schedule.ts). Pré-preenchidos
// e editáveis; se o usuário não mexer, o comportamento é idêntico ao atual.
export const ANTI_BAN_DEFAULTS: Required<ThrottleConfig> = {
  delay_min: 30,
  delay_max: 90,
  daily_cap: 50,
  window_start: 8,
  window_end: 20,
}

export function AntiBanSettings({ value, onChange }: AntiBanSettingsProps) {
  const v = { ...ANTI_BAN_DEFAULTS, ...(value ?? {}) }
  const set = (patch: Partial<ThrottleConfig>) => onChange({ ...v, ...patch })
  const num = (e: React.ChangeEvent<HTMLInputElement>) => Number(e.target.value)

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="text-sm font-medium">Proteção anti-bloqueio</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ab-dmin" className="text-xs">Intervalo mín. (s)</Label>
          <Input id="ab-dmin" type="number" min={1} value={String(v.delay_min)} onChange={(e) => set({ delay_min: num(e) })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ab-dmax" className="text-xs">Intervalo máx. (s)</Label>
          <Input id="ab-dmax" type="number" min={1} value={String(v.delay_max)} onChange={(e) => set({ delay_max: num(e) })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ab-cap" className="text-xs">Limite por dia (por número)</Label>
          <Input id="ab-cap" type="number" min={1} value={String(v.daily_cap)} onChange={(e) => set({ daily_cap: num(e) })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Janela de envio (h)</Label>
          <div className="flex items-center gap-2">
            <Input aria-label="Início" type="number" min={0} max={23} value={String(v.window_start)} onChange={(e) => set({ window_start: num(e) })} />
            <span className="text-xs text-muted-foreground">às</span>
            <Input aria-label="Fim" type="number" min={1} max={24} value={String(v.window_end)} onChange={(e) => set({ window_end: num(e) })} />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Protege o número de bloqueios do WhatsApp em envios em massa. Sem mexer, usa os padrões do sistema.
      </p>
    </div>
  )
}
