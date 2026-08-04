import { cn } from '@/lib/utils'

interface BreakdownItem {
  value: string
  color: string
  dotColor: string
  label: string
}

const Breakdown = ({ items }: { items: BreakdownItem[] }) => (
  <>
    <div className="border-t border-border/30 my-3" />
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <span className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', item.dotColor)} />
            {item.label}
          </span>
          <span className={cn('text-xs font-medium', item.color)}>{item.value}</span>
        </div>
      ))}
    </div>
  </>
)

export type { BreakdownItem }
export { Breakdown }
