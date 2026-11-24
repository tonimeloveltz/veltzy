import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useFormContext, useWatch } from 'react-hook-form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { EditorSection } from '@/components/events/editor/editor-section'
import { useWahaInstances } from '@/hooks/use-whatsapp-instances'
import { formatPhoneBR } from '@/lib/phone'
import type { EditorValues } from '@/lib/events/editor-form'

/** Sessao WAHA que envia as mensagens do evento (D12). Padrao: a primeira conectada. */
export const WhatsappSessionSection = ({ readOnly }: { readOnly: boolean }) => {
  const { control, setValue } = useFormContext<EditorValues>()
  const session = useWatch({ control, name: 'whatsapp_session_name' })
  const { data: instances = [], isLoading } = useWahaInstances()
  const current = instances.find((i) => i.session_name === session)
  const firstConnected = instances.find((i) => i.status === 'connected')

  useEffect(() => {
    if (!readOnly && !session && firstConnected) {
      setValue('whatsapp_session_name', firstConnected.session_name, { shouldDirty: true })
    }
  }, [readOnly, session, firstConnected, setValue])

  const connected = current?.status === 'connected'

  return (
    <EditorSection title="WhatsApp do evento" description="Sessão WAHA que envia confirmação, lembrete e pós-evento.">
      {!isLoading && instances.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          A empresa não tem sessão WAHA. Sem ela, as mensagens não saem.{' '}
          <Link to="/admin?tab=integracoes" className="text-primary underline">Configurar</Link>
        </p>
      ) : (
        <>
          <Select value={session || undefined} onValueChange={(v) => setValue('whatsapp_session_name', v, { shouldDirty: true })}>
            <SelectTrigger aria-label="Sessão WAHA"><SelectValue placeholder="Escolha a sessão" /></SelectTrigger>
            <SelectContent>
              {instances.map((i) => (
                <SelectItem key={i.session_name} value={i.session_name}>
                  {i.display_name || i.session_name}{i.phone_number ? ` · ${formatPhoneBR(i.phone_number)}` : ''}
                  {i.status !== 'connected' ? ' (desconectada)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {current && (
            <p className={cn('text-sm', connected ? 'text-primary' : 'text-destructive')}>
              {connected ? 'WAHA conectada' : 'Desconectada'}
              {current.phone_number ? ` · ${formatPhoneBR(current.phone_number)}` : ''}
              {!connected && <> · <Link to="/admin?tab=integracoes" className="underline">Configurar</Link></>}
            </p>
          )}
          {session && !current && !isLoading && (
            <p className="text-sm text-destructive">A sessão salva não existe mais. Escolha outra.</p>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">Sessão desconectada na hora do envio: a mensagem não sai e fica registrada.</p>
    </EditorSection>
  )
}
