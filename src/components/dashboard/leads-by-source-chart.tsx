import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useLeadsBySource } from '@/hooks/use-dashboard-metrics'

const opacityLevels = [1.0, 0.75, 0.5, 0.3, 0.15]

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) => {
  if (!active || !payload?.[0]) return null
  const d = payload[0]
  return (
    <div className="glass-card rounded-lg px-3 py-2 shadow-lg">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-medium">{d.name}</span>
        <span className="text-muted-foreground">{d.value} leads</span>
      </div>
    </div>
  )
}

const LeadsBySourceChart = ({ days, pipelineId }: { days?: number; pipelineId?: string | null }) => {
  const { data } = useLeadsBySource(days, pipelineId)
  const total = data?.reduce((sum, s) => sum + s.count, 0) ?? 0


  if (data?.length === 0) {
    return (
      <div className="bg-card border border-border/30 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-semibold">Leads por Origem</h3>
        </div>
        <p className="text-xs text-muted-foreground text-center py-6">Nenhum lead cadastrado no periodo</p>
      </div>
    )
  }

  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4">Leads por Origem</h3>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
        <div className="h-[170px] w-[170px] shrink-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <PieChart>
              <Pie
                data={data ?? []}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={75}
                paddingAngle={3}
                strokeWidth={0}
                animationDuration={800}
              >
                {data?.map((_, idx) => (
                  <Cell
                    key={idx}
                    fill="hsl(var(--primary))"
                    fillOpacity={opacityLevels[Math.min(idx, opacityLevels.length - 1)]}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full space-y-3 sm:w-auto sm:flex-1">
          {data?.map((s, idx) => (
            <div key={s.source_id} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{
                    backgroundColor: 'hsl(var(--primary))',
                    opacity: opacityLevels[Math.min(idx, opacityLevels.length - 1)],
                  }}
                />
                <span className="text-xs font-medium">{s.name}</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold">{s.count}</span>
                <span className="text-[10px] text-muted-foreground ml-1">({total > 0 ? Math.round((s.count / total) * 100) : 0}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export { LeadsBySourceChart }
