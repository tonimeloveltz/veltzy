import { useNavigate } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const AcessoNegadoPage = () => {
  const navigate = useNavigate()

  return (
    <div className="flex h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <ShieldX className="mx-auto h-12 w-12 text-destructive" />
          <CardTitle className="mt-4">Acesso negado</CardTitle>
          <CardDescription>
            Você não tem permissão para acessar esta página.
            Entre em contato com o administrador da sua empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Voltar
          </Button>
          <Button onClick={() => navigate('/')}>
            Ir para o Painel
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default AcessoNegadoPage
