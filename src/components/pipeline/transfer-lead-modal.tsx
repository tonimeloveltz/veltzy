import { useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useAssignDeal } from '@/hooks/use-deals'
import { useTeamMembers } from '@/hooks/use-team'

const ALLOWED_ROLES = ['admin', 'manager', 'seller', 'super_admin']

interface TransferLeadModalProps {
  leadId: string | null
  dealId?: string | null
  open: boolean
  onClose: () => void
}

const TransferLeadModal = ({ leadId: _leadId, dealId, open, onClose }: TransferLeadModalProps) => {
  const assignDeal = useAssignDeal()
  const { data: members } = useTeamMembers()
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  const eligibleMembers = useMemo(() => {
    if (!members) return []
    return members.filter((m) =>
      m.user_roles?.some((r) => ALLOWED_ROLES.includes(r.role))
    )
  }, [members])

  const handleTransfer = async () => {
    if (!dealId || !selectedUserId) return
    await assignDeal.mutateAsync({ dealId, userId: selectedUserId })
    toast.success('Negócio transferido com sucesso!')
    setSelectedUserId('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Transferir Negócio</DialogTitle>
          <DialogDescription>Selecione o vendedor para transferir</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um vendedor" />
            </SelectTrigger>
            <SelectContent>
              {eligibleMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleTransfer} disabled={!selectedUserId || assignDeal.isPending}>
              {assignDeal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transferir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { TransferLeadModal }
