import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

const NotFoundPage = () => {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <p className="text-muted-foreground">Pagina nao encontrada</p>
      <Button asChild>
        <Link to="/">Voltar ao inicio</Link>
      </Button>
    </div>
  )
}

export default NotFoundPage
