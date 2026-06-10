import { useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useTeamMembers } from '@/hooks/use-team'
import { useBulkTransfer, useBulkTransferDeals } from '@/hooks/use-bulk-leads'

const ALLOWED_ROLES = ['admin', 'manager', 'seller', 'super_admin']

interface BulkTransferModalProps {
  open: boolean
  onClose: () => void
  leadIds: string[]
  onSuccess: () => void
  mode?: 'leads' | 'deals'
}

export const BulkTransferModal = ({ open, onClose, leadIds, onSuccess, mode = 'leads' }: BulkTransferModalProps) => {
  const [targetUserId, setTargetUserId] = useState<string>('')
  const { data: members } = useTeamMembers()

  const eligibleMembers = useMemo(() => {
    if (!members) return []
    return members.filter((m) =>
      m.user_roles?.some((r) => ALLOWED_ROLES.includes(r.role))
    )
  }, [members])

  const handleClose = () => {
    setTargetUserId('')
    onClose()
  }

  const bulkTransferLeads = useBulkTransfer(() => { onSuccess(); handleClose() })
  const bulkTransferDeals = useBulkTransferDeals(() => { onSuccess(); handleClose() })
  const activeMutation = mode === 'deals' ? bulkTransferDeals : bulkTransferLeads

  const handleTransfer = async () => {
    if (!targetUserId) return
    if (mode === 'deals') {
      await bulkTransferDeals.mutateAsync({ dealIds: leadIds, targetUserId })
    } else {
      await bulkTransferLeads.mutateAsync({ leadIds, targetUserId })
    }
  }

  const label = mode === 'deals' ? 'negócio' : 'lead'

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir {leadIds.length} {label}{leadIds.length > 1 ? 's' : ''}</DialogTitle>
          <DialogDescription>
            Selecione o membro da equipe que receberá os {label}s selecionados.
          </DialogDescription>
        </DialogHeader>

        <Select value={targetUserId} onValueChange={setTargetUserId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um membro" />
          </SelectTrigger>
          <SelectContent>
            {eligibleMembers.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name} ({member.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={activeMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleTransfer} disabled={!targetUserId || activeMutation.isPending}>
            {activeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Transferindo...
              </>
            ) : (
              'Transferir'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
