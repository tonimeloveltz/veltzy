import { TrendingUp } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { useMonthlyComparisonGrid } from '@/hooks/use-dashboard-metrics'

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card rounded-lg px-3 py-2 shadow-lg space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">
            {p.dataKey === 'value' ? fmtCurrency(p.value) : p.dataKey === 'conversion' ? `${p.value}%` : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const MetricsLineChart = ({ months, pipelineId }: { months: number; pipelineId?: string | null }) => {
  const { data, isLoading } = useMonthlyComparisonGrid(months, pipelineId)

  if (isLoading) {
    return (
      <div className="bg-card border border-border/30 rounded-xl p-4">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    )
  }

  if (!data?.length) return null

  return (
    <div className="bg-card border border-border/30 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold text-foreground">Evolução das Métricas</h3>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <XAxis
              dataKey="month"
              interval="preserveStartEnd"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis yAxisId="left" hide />
            <YAxis yAxisId="right" hide />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="leads"
              name="Negocios"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="conversion"
              name="Conversão %"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="deals"
              name="Deals Fechados"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="value"
              name="Valor Fechados"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export { MetricsLineChart }
