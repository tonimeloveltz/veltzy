import { useState } from 'react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/time'
import { AlertTriangle, Pencil } from 'lucide-react'
import { MediaContent } from '@/components/inbox/message-media'
import { MessageEditForm } from '@/components/inbox/message-edit-form'
import { useEditMessage } from '@/hooks/use-edit-message'
import { canEditMessage } from '@/lib/message-edit'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Message } from '@/types/database'

interface MessageBubbleProps {
  message: Message
  senderName?: string
}

const MessageBubble = ({ message, senderName }: MessageBubbleProps) => {
  const isLead = message.sender_type === 'lead'
  const isAi = message.sender_type === 'ai'
  const isHuman = message.sender_type === 'human'
  const isOptimistic = message.id.startsWith('optimistic-')

  const [isEditing, setIsEditing] = useState(false)
  const editMessage = useEditMessage()

  const handleEditSubmit = (content: string) => {
    editMessage.mutate(
      { messageId: message.id, content },
      { onSuccess: () => setIsEditing(false) },
    )
  }

  return (
    <div className={cn('group flex', isLead ? 'justify-start' : 'justify-end', isOptimistic && 'opacity-70')}>
      <div
        className={cn(
          'max-w-[75%] space-y-1 px-3 py-2 rounded-xl',
          isLead && 'bg-muted text-foreground rounded-bl-sm',
          isHuman && 'bg-primary text-primary-foreground rounded-br-sm',
          isAi && 'bg-accent text-accent-foreground rounded-bl-sm border border-primary/20',
        )}
      >
        {isHuman && senderName && (
          <p className="text-[10px] font-medium opacity-70">{senderName}</p>
        )}
        {isAi && (
          <p className="text-[10px] font-medium opacity-70">IA SDR</p>
        )}

        {message.message_type !== 'text' && <MediaContent message={message} />}

        {isEditing ? (
          <MessageEditForm
            initialContent={message.content}
            isPending={editMessage.isPending}
            onCancel={() => setIsEditing(false)}
            onSubmit={handleEditSubmit}
          />
        ) : (
          <>
            {message.content && !['audio', 'location', 'contact'].includes(message.message_type) && (
              <p className={cn(
                'whitespace-pre-wrap break-words',
                message.message_type === 'text' ? 'text-sm' : 'text-xs opacity-70',
              )}>{message.content}</p>
            )}

            {message.message_type === 'text' && !message.content && (
              <p className="text-sm italic opacity-50">[mensagem]</p>
            )}
          </>
        )}

        <p className={cn('text-[10px] text-right flex items-center justify-end gap-1', isLead ? 'opacity-40' : 'opacity-60')}>
          {!isEditing && canEditMessage(message) && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              title="Editar mensagem"
              className="opacity-0 transition-smooth group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {message.edited_at && <span className="italic opacity-70">editada</span>}
          {timeAgo(message.created_at)}
          {message.delivery_status === 'failed' && (
            <Tooltip>
              <TooltipTrigger>
                <AlertTriangle className="h-3 w-3 text-destructive inline" />
              </TooltipTrigger>
              <TooltipContent>{message.delivery_error ? `Falha: ${message.delivery_error}` : 'Falha no envio'}</TooltipContent>
            </Tooltip>
          )}
        </p>
      </div>
    </div>
  )
}

export { MessageBubble }
