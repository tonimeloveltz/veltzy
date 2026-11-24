import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RegistrationFormFields } from '@/components/events/public/registration-form-fields'
import { useRegisterManually } from '@/hooks/events/use-register-manually'
import { answersPayload, emptyRegistration, type FormFieldSpec } from '@/lib/events/registration-form'

interface AddRegistrantDialogProps {
  eventId: string
  fields: FormFieldSpec[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const RESULT_TEXT: Record<string, string> = {
  duplicate: 'Este WhatsApp já está inscrito no evento.',
  sold_out: 'Não há vagas.',
  closed: 'As inscrições estão fechadas.',
  not_found: 'Evento não encontrado.',
  canceled: 'O evento foi cancelado.',
  finished: 'O evento já terminou.',
  not_open: 'As inscrições ainda não abriram.',
}

/** Inscricao manual: o mesmo formulario da pagina publica, sem os aceites. */
export const AddRegistrantDialog = ({ eventId, fields, open, onOpenChange }: AddRegistrantDialogProps) => {
  const [values, setValues] = useState(emptyRegistration)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const register = useRegisterManually(eventId)

  const close = (o: boolean) => {
    if (!o) { setValues(emptyRegistration()); setErrors({}) }
    onOpenChange(o)
  }

  const submit = () => register.mutate(
    { first_name: values.first_name, last_name: values.last_name, email: values.email, whatsapp: values.whatsapp,
      answers: answersPayload(fields, values) },
    {
      onSuccess: (r) => {
        if (r.result === 'ok') { toast.success('Inscrição adicionada.'); close(false); return }
        if (r.result === 'validation' && 'errors' in r) { setErrors(r.errors); return }
        toast.error(RESULT_TEXT[r.result] ?? 'Não foi possível inscrever.')
      },
      onError: () => toast.error('Não foi possível inscrever.'),
    },
  )

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar inscrito</DialogTitle>
          <DialogDescription>Cria o contato (ou reaproveita) e o negócio, como na página. A confirmação sai pelo WhatsApp.</DialogDescription>
        </DialogHeader>
        <RegistrationFormFields fields={fields} values={values} errors={errors} onChange={setValues} />
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={register.isPending}>
            {register.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Inscrever
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
