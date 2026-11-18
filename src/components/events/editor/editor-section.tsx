import type { ReactNode } from 'react'

interface EditorSectionProps {
  title: string
  description?: string
  children: ReactNode
}

export const EditorSection = ({ title, description, children }: EditorSectionProps) => (
  <section className="space-y-4 rounded-lg border bg-card p-4 md:p-5">
    <div>
      <h2 className="font-medium">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
    {children}
  </section>
)
