import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bug, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCreateTicket } from '@/hooks/use-support-tickets'
import { useRoles } from '@/hooks/use-roles'

const ErrorReportButton = () => {
  const { isAdmin } = useRoles()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const createTicket = useCreateTicket()

  if (!isAdmin || pathname === '/inbox') return null

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return
    await createTicket.mutateAsync({
      title,
      description,
      priority,
      page_url: window.location.href,
      user_agent: navigator.userAgent,
    })
    setTitle('')
    setDescription('')
    setPriority('medium')
    setOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-muted border border-border/50 text-muted-foreground hover:text-accent-foreground hover:bg-accent transition-smooth shadow-lg"
        title="Reportar problema"
      >
        <Bug className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reportar Problema</DialogTitle>
            <DialogDescription>Descreva o problema encontrado</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Titulo</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resumo do problema" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descricao</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm input-clean"
                placeholder="Detalhes..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Media</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="critical">Critica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={createTicket.isPending || !title.trim()}>
              {createTicket.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export { ErrorReportButton }
