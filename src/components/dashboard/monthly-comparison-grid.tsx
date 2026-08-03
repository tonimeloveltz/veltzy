import {
  BarChart3, Users, TrendingUp, CheckCircle, DollarSign,
} from 'lucide-react'
import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, LabelList } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { useMonthlyComparisonGrid } from '@/hooks/use-dashboard-metrics'
import { useIsMobile } from '@/hooks/use-mobile'
import type { MonthlyGridData } from '@/services/dashboard.service'

const periodOptions = [
  { label: '3 meses', value: 3 },
  { label: '6 meses', value: 6 },
  { label: '12 meses', value: 12 },
] as const

interface MiniChartProps {
  title: string
  icon: React.ElementType
  dataKey: string
  data: MonthlyGridData[]
  formatter?: (v: number) => string
}

const CustomLabel = ({ x, y, width, index, data, dataKey }: {
  x?: number
  y?: number
  width?: number
  index?: number
  data: MonthlyGridData[]
  dataKey: string
}) => {
  if (index === undefined || x === undefined || y === undefined || width === undefined) return null
  if (index === 0 || !data[index - 1]) return null
  const prev = (data[index - 1] as unknown as Record<string, number>)[dataKey]
  const curr = (data[index] as unknown as Record<string, number>)[dataKey]
  if (!prev || prev === 0) return null
  const pct = ((curr - prev) / prev * 100).toFixed(0)
  const isPositive = curr >= prev
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      textAnchor="middle"
      fontSize={11}
      fontWeight={500}
      fill={isPositive ? '#10b981' : '#ef4444'}
    >
      {isPositive ? '+' : ''}{pct}%
    </text>
  )
}

const CustomTooltip = ({
  active,
  payload,
  formatter,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string }>
  formatter?: (v: number) => string
}) => {
  if (!active || !payload?.[0]) return null
  const val = payload[0].value
  return (
    <div className="glass-card rounded-lg px-2.5 py-1.5 shadow-lg">
      <span className="text-xs font-semibold">{formatter ? formatter(val) : val}</span>
    </div>
  )
}

const MiniChart = ({ title, icon: Icon, dataKey, data, formatter }: MiniChartProps) => {
  const lastIndex = data.length - 1
  const isMobile = useIsMobile()
  return (
    <div className="bg-card border border-border/30 rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
      </div>
      <div className="h-[120px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          <BarChart data={data} margin={{ top: 16, right: 2, bottom: 0, left: -24 }}>
            <XAxis
              dataKey="month"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              content={<CustomTooltip formatter={formatter} />}
              cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
            />
            <Bar
              dataKey={dataKey}
              radius={[6, 6, 0, 0]}
              animationDuration={600}
            >
              {data.map((_, idx) => (
                <Cell
                  key={idx}
                  fill={idx === lastIndex ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                  fillOpacity={idx === lastIndex ? 0.9 : 0.25}
                />
              ))}
              <LabelList
                content={isMobile
                  ? () => null
                  : (props) => <CustomLabel {...(props as { x?: number; y?: number; width?: number; index?: number })} data={data} dataKey={dataKey} />}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

interface MonthlyComparisonGridProps {
  months: number
  onMonthsChange: (months: number) => void
  pipelineId?: string | null
}

const MonthlyComparisonGrid = ({ months, onMonthsChange, pipelineId }: MonthlyComparisonGridProps) => {
  const { data, isLoading } = useMonthlyComparisonGrid(months, pipelineId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Comparativo Mensal</h3>
        </div>
        <select
          value={months}
          onChange={(e) => onMonthsChange(Number(e.target.value))}
          className="text-xs bg-card border border-border/40 rounded-lg px-3 py-1.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {periodOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-card border border-border/30 rounded-xl p-3">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-[120px] w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniChart
            title="Negócios"
            icon={Users}
            dataKey="leads"
            data={data ?? []}
          />
          <MiniChart
            title="Conversão %"
            icon={TrendingUp}
            dataKey="conversion"
            data={data ?? []}
            formatter={(v) => `${v}%`}
          />
          <MiniChart
            title="Deals Fechados"
            icon={CheckCircle}
            dataKey="deals"
            data={data ?? []}
          />
          <MiniChart
            title="Valor Fechados"
            icon={DollarSign}
            dataKey="value"
            data={data ?? []}
            formatter={fmtCurrency}
          />
        </div>
      )}
    </div>
  )
}

export { MonthlyComparisonGrid }
