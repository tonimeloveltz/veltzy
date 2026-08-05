import { Loader2 } from 'lucide-react'

const PageLoadingSkeleton = () => {
  return (
    <div className="flex h-dvh items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )
}

export { PageLoadingSkeleton }
