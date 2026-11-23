import type { EventStats } from '@/lib/events/event-stats'

const Card = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-lg border bg-card p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold">{value}</p>
    {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
  </div>
)

export const StatCards = ({ s }: { s: EventStats }) => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
    <Card label="Inscritos" value={String(s.registered)} sub={s.capacity !== null ? `de ${s.capacity} vagas` : 'sem limite de vagas'} />
    <Card label="Vagas restantes" value={s.remaining === null ? 'Sem limite' : String(s.remaining)} />
    <Card label="Confirmados" value={String(s.confirmed)} sub={`${s.confirmedPct}% dos inscritos`} />
    <Card label="Presentes" value={String(s.attended)} />
    <Card label="Taxa de presença" value={s.attendanceRate === null ? 'Sem dados' : `${s.attendanceRate}%`}
      sub={s.attendanceRate === null ? 'Aparece depois do evento' : 'presentes / (presentes + ausentes)'} />
  </div>
)
