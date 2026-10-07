import { useEffect, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useWhatsAppNumbers } from '@/hooks/use-whatsapp-numbers'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const NONE = '__none__'

interface SenderNumberSelectProps {
  /** Provider ativo da empresa ('waha' | 'evolution'); filtra os números listados. */
  provider: string
  /** undefined = ainda não escolhido (aplica o default); null = nenhum. */
  value: string | null | undefined
  onChange: (next: string | null) => void
  force: boolean
  onForceChange: (next: boolean) => void
}

// Número de envio da campanha (SPEC seletor-numero-campanha). Lead com número gravado
// continua saindo por ele; o escolhido cobre quem não tem, ou todos com o checkbox.
export function SenderNumberSelect({ provider, value, onChange, force, onForceChange }: SenderNumberSelectProps) {
  const { data: numbers, isLoading, isError } = useWhatsAppNumbers()
  const options = useMemo(
    () => (numbers ?? []).filter((n) => n.provider === provider && n.status === 'connected'),
    [numbers, provider],
  )

  // Default = primeiro número conectado, só enquanto o usuário não escolheu nada.
  useEffect(() => {
    if (value === undefined && options.length > 0) onChange(options[0].ref)
  }, [value, options, onChange])

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label>Número de envio</Label>
      {isLoading ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando números…
        </p>
      ) : isError ? (
        <p className="text-sm text-destructive">Não foi possível carregar os números de WhatsApp.</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-destructive">
          Nenhum número conectado. Só recebem os contatos que já conversaram por algum número.
        </p>
      ) : (
        <>
          <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
            <SelectTrigger><SelectValue placeholder="Escolha o número" /></SelectTrigger>
            <SelectContent>
              {options.map((n) => (
                <SelectItem key={n.ref} value={n.ref}>{n.displayNumber ?? n.ref}</SelectItem>
              ))}
              <SelectItem value={NONE}>Nenhum (só o número de cada conversa)</SelectItem>
            </SelectContent>
          </Select>
          {value && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={force} onChange={(e) => onForceChange(e.target.checked)} />
              Enviar todos por este número
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            {force && value
              ? 'Todos os contatos recebem por este número, mesmo quem já conversou por outro.'
              : 'Quem já conversou com a empresa recebe pelo número da conversa. Os demais recebem por este.'}
          </p>
        </>
      )}
    </div>
  )
}
