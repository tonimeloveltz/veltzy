import type { ReactNode } from 'react'

interface ComingSoonTabProps {
  children: ReactNode
}

/** Abas 3 e 4 chegam na parte c3 do bloco (c). */
export const ComingSoonTab = ({ children }: ComingSoonTabProps) => (
  <div className="space-y-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{children}</div>
)
