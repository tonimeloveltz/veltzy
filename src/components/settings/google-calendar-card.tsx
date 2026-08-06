import { Calendar, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  useGoogleCalendarConnection,
  useConnectGoogleCalendar,
  useDisconnectGoogleCalendar,
} from '@/hooks/use-google-calendar'

/**
 * Card de conexao do Google Agenda, em Minha Conta.
 *
 * Tres estados: desconectado, conectado, e precisa reconectar (quando o token
 * foi revogado no Google e o proximo agendamento gravou is_active = false).
 */
const GoogleCalendarCard = () => {
  const { data: connection, isLoading } = useGoogleCalendarConnection()
  const connect = useConnectGoogleCalendar()
  const disconnect = useDisconnectGoogleCalendar()

  const needsReconnect = !!connection && !connection.is_active

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Google Agenda
        </CardTitle>
        <CardDescription>
          Conecte sua conta para que as reunioes agendadas no inbox virem eventos na sua agenda,
          com convite enviado por email ao cliente.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : !connection ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Nenhuma conta conectada.</p>
            <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
              {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Conectar
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {needsReconnect ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{connection.google_email}</p>
                  <p className="text-xs text-muted-foreground">
                    {needsReconnect ? 'Conexao expirada' : 'Conectado'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {needsReconnect && (
                  <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
                    {connect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reconectar
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => disconnect.mutate()}
                  disabled={disconnect.isPending}
                >
                  {disconnect.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Desconectar
                </Button>
              </div>
            </div>

            {needsReconnect && connection.last_error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {connection.last_error}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { GoogleCalendarCard }
