import type { EventStats } from '@/lib/events/event-stats'

export const OriginTable = ({ rows }: { rows: EventStats['byOrigin'] }) => (
  <div className="rounded-lg border bg-card p-4">
    <p className="mb-3 text-sm font-medium">Por origem</p>
    {rows.length === 0 ? <p className="text-sm text-muted-foreground">Sem inscrições ainda.</p> : (
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr><th className="pb-2 font-medium">Origem</th><th className="pb-2 text-right font-medium">Inscrições</th><th className="pb-2 text-right font-medium">Presenças</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.origin} className="border-t">
              <td className="py-1.5">{r.origin}</td><td className="py-1.5 text-right">{r.registrations}</td><td className="py-1.5 text-right">{r.attended}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)

export const Funnel = ({ f }: { f: EventStats['funnel'] }) => {
  const steps = [
    { label: 'Inscrito', value: f.registered }, { label: 'Confirmado', value: f.confirmed }, { label: 'Presente', value: f.attended },
  ]
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="mb-3 text-sm font-medium">Funil</p>
      <div className="space-y-2">
        {steps.map((s) => {
          const pct = f.registered === 0 ? 0 : Math.round((s.value / f.registered) * 100)
          return (
            <div key={s.label} className="space-y-1">
              <div className="flex justify-between text-xs"><span>{s.label}</span><span className="text-muted-foreground">{s.value} · {pct}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
