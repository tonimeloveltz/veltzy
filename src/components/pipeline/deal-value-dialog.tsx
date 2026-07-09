import { useState } from 'react'
import { DollarSign } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface DealValueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leadName: string
  onConfirm: (value: number) => void
}

const DealValueDialog = ({ open, onOpenChange, leadName, onConfirm }: DealValueDialogProps) => {
  const [value, setValue] = useState<number | undefined>(undefined)

  const handleConfirm = () => {
    if (!value || value <= 0) {
      toast.error('Valor invalido', { description: 'Informe um valor maior que zero.' })
      return
    }
    onConfirm(value)
    setValue(undefined)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setValue(undefined); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Valor do negocio
          </DialogTitle>
          <DialogDescription>
            Informe o valor para mover <strong>{leadName}</strong> para Proposta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="deal-value">Valor (R$)</Label>
          <CurrencyInput
            id="deal-value"
            placeholder="R$ 0,00"
            value={value}
            onChange={setValue}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm}>Confirmar e mover</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { DealValueDialog }
