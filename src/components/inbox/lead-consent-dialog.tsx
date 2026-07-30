import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useGrantConsent } from '@/hooks/use-lead-consent'
import type { ConsentOrigin, ConsentPurpose } from '@/types/lead-consent'

interface LeadConsentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadId: string
  finalidade?: ConsentPurpose
  onGranted?: () => void
}

const ORIGENS: { value: ConsentOrigin; label: string }[] = [
  { value: 'manual', label: 'Registro manual' },
  { value: 'formulario', label: 'Formulário' },
  { value: 'campanha', label: 'Campanha' },
  { value: 'importacao', label: 'Importação' },
]

export const LeadConsentDialog = ({
  open,
  onOpenChange,
  leadId,
  finalidade = 'marketing_whatsapp',
  onGranted,
}: LeadConsentDialogProps) => {
  const grant = useGrantConsent()

  const [termoVersao, setTermoVersao] = useState('v1')
  const [textoAceito, setTextoAceito] = useState('')
  const [origem, setOrigem] = useState<ConsentOrigin>('manual')

  const reset = () => {
    setTermoVersao('v1'); setTextoAceito(''); setOrigem('manual')
  }

  const canSubmit = termoVersao.trim().length > 0 && !grant.isPending

  const handleSubmit = () => {
    grant.mutate(
      { leadId, finalidade, termoVersao: termoVersao.trim(), textoAceito: textoAceito.trim() || undefined, origem },
      {
        onSuccess: () => {
          toast.success('Opt-in registrado.')
          reset()
          onOpenChange(false)
          onGranted?.()
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao registrar o opt-in.'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar opt-in de marketing</DialogTitle>
          <DialogDescription>
            Consentimento do contato para receber mensagens de marketing no WhatsApp (LGPD).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Origem do consentimento</Label>
            <Select value={origem} onValueChange={(v) => setOrigem(v as ConsentOrigin)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORIGENS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Versão do termo</Label>
            <Input value={termoVersao} onChange={(e) => setTermoVersao(e.target.value)} placeholder="ex: v1" />
          </div>

          <div className="space-y-1.5">
            <Label>Texto aceito (opcional)</Label>
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={textoAceito}
              onChange={(e) => setTextoAceito(e.target.value)}
              placeholder="Texto do termo que o contato aceitou."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={grant.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {grant.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Registrar opt-in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
