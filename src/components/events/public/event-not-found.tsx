/** 404 neutro: sem marca de nenhum tenant. */
export const EventNotFound = ({ what = 'Evento não encontrado' }: { what?: string }) => (
  <div className="flex min-h-dvh items-center justify-center bg-background p-6 text-center">
    <div className="space-y-2">
      <p className="text-lg font-semibold">{what}</p>
      <p className="text-sm text-muted-foreground">Confira o link que você recebeu.</p>
    </div>
  </div>
)
