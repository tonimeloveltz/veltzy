import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { EventStats } from '@/lib/events/event-stats'

const tick = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 }

export const PerDayChart = ({ data }: { data: EventStats['perDay'] }) => (
  <div className="rounded-lg border bg-card p-4">
    <p className="mb-3 text-sm font-medium">Inscrições e check-ins por dia</p>
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -20, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
          <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
            contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="registrations" name="Inscrições" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          <Bar dataKey="checkins" name="Check-ins" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
)
