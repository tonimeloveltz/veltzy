import { AlertTriangle } from 'lucide-react'
import {
  formatDateBR,
  instagramReconnectReason,
  type InstagramConnectionSummary,
} from '@/lib/instagram-connection-state'

interface InstagramConnectionStatusProps {
  connection: InstagramConnectionSummary
  now: Date
}

/** Detalhe da conta conectada e, quando houver, o motivo para reconectar. */
const InstagramConnectionStatus = ({ connection, now }: InstagramConnectionStatusProps) => {
  const reason = instagramReconnectReason(connection, now)

  return (
    <div className="space-y-3">
      <div className="space-y-0.5 text-sm">
        {connection.instagram_username && <p className="font-medium">@{connection.instagram_username}</p>}
        {connection.instagram_name && <p className="text-muted-foreground">{connection.instagram_name}</p>}
        {connection.is_active && connection.token_expires_at && (
          <p className="text-xs text-muted-foreground">
            Token válido até {formatDateBR(connection.token_expires_at)}
          </p>
        )}
      </div>

      {reason && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-0.5">
            <p>{reason.title}</p>
            {reason.detail && <p className="text-xs opacity-80 break-words">{reason.detail}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export { InstagramConnectionStatus }
