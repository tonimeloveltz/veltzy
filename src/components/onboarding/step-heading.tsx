interface StepHeadingProps {
  eyebrow: string
  title: string
  description?: string
}

export const StepHeading = ({ eyebrow, title, description }: StepHeadingProps) => (
  <div>
    <p className="text-xs font-bold uppercase tracking-[0.08em] text-primary">{eyebrow}</p>
    <h1 className="mb-3.5 mt-2.5 text-2xl font-bold leading-tight tracking-tight sm:text-4xl">{title}</h1>
    {description && <p className="text-base leading-relaxed text-muted-foreground sm:text-[17px]">{description}</p>}
  </div>
)
