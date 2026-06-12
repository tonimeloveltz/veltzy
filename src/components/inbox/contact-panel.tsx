import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  X, Save, Loader2, Phone, Mail, Building2, AtSign, Link2,
  CheckSquare, Video, MessageCircle as FollowUpIcon, Check, Plus,
} from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { LeadTagsInput } from '@/components/pipeline/lead-tags-input'
import { LeadDealsPanel } from '@/components/inbox/lead-deals-panel'
import { CreateTaskModal } from '@/components/tarefas/create-task-modal'
import { useUpdateLead } from '@/hooks/use-leads'
import { useLeadSources } from '@/hooks/use-lead-sources'
import { useTeamMembers } from '@/hooks/use-team'
import { useLeadTasks, useCompleteTask } from '@/hooks/use-tasks'
import { useRoles } from '@/hooks/use-roles'
import { useWhatsAppStatus } from '@/hooks/use-whatsapp-status'
import { useInboxStore } from '@/stores/inbox.store'
import { leadDisplayName } from '@/lib/phone'
import type { LeadWithLastMessage, TaskType } from '@/types/database'

const temperatureLabels: Record<string, { label: string; color: string }> = {
  cold: { label: 'Frio', color: 'text-blue-500' },
  warm: { label: 'Morno', color: 'text-yellow-500' },
  hot: { label: 'Quente', color: 'text-orange-500' },
  fire: { label: 'Fire', color: 'text-red-500' },
}

const taskTypeIcons: Record<TaskType, typeof CheckSquare> = {
  todo: CheckSquare,
  followup: FollowUpIcon,
  call: Phone,
  meeting: Video,
}

const taskStatusLabels: Record<string, string> = {
  pending: 'A fazer',
  in_progress: 'Em andamento',
  done: 'Feito',
}

interface ContactPanelProps {
  lead: LeadWithLastMessage
}

const ContactPanel = ({ lead }: ContactPanelProps) => {
  const updateLead = useUpdateLead()
  const { data: sources } = useLeadSources()
  const { data: members } = useTeamMembers()
  const { data: tasks, isLoading: tasksLoading } = useLeadTasks(lead.id)
  const completeTask = useCompleteTask()
  const { isAdmin, isManager } = useRoles()
  const { data: waStatus } = useWhatsAppStatus()
  const isEvolution = waStatus?.provider === 'evolution'
  const toggleContactPanel = useInboxStore((s) => s.toggleContactPanel)

  const [createTaskOpen, setCreateTaskOpen] = useState(false)

  // Editable fields
  const [name, setName] = useState(lead.name ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [companyName, setCompanyName] = useState(lead.company_name ?? '')
  const [instagramHandle, setInstagramHandle] = useState(lead.instagram_handle ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(lead.linkedin_url ?? '')
  const [sourceId, setSourceId] = useState(lead.source_id ?? '')
  const [assignedTo, setAssignedTo] = useState(lead.assigned_to ?? '')
  const [observations, setObservations] = useState(lead.observations ?? '')
  const [tags, setTags] = useState<string[]>(lead.tags ?? [])
  const [dirty, setDirty] = useState(false)

  // Reset on lead change
  useEffect(() => {
    setName(lead.name ?? '')
    setEmail(lead.email ?? '')
    setCompanyName(lead.company_name ?? '')
    setInstagramHandle(lead.instagram_handle ?? '')
    setLinkedinUrl(lead.linkedin_url ?? '')
    setSourceId(lead.source_id ?? '')
    setAssignedTo(lead.assigned_to ?? '')
    setObservations(lead.observations ?? '')
    setTags(lead.tags ?? [])
    setDirty(false)
  }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const markDirty = () => setDirty(true)

  const handleSave = async () => {
    await updateLead.mutateAsync({
      leadId: lead.id,
      data: {
        name: name || null,
        email: email || null,
        company_name: companyName || null,
        instagram_handle: instagramHandle || null,
        linkedin_url: linkedinUrl || null,
        source_id: sourceId || null,
        assigned_to: assignedTo || null,
        observations: observations || null,
        tags,
      },
    })
    setDirty(false)
  }

  const eligibleMembers = members?.filter((m) =>
    m.user_roles?.some((r) => ['admin', 'manager', 'seller', 'super_admin'].includes(r.role))
  ) ?? []

  const assigneeName = assignedTo
    ? members?.find((m) => m.id === assignedTo)?.name ?? null
    : null

  const avatarSrc = lead.avatar_url || undefined
  const displayName = leadDisplayName(lead.name, lead.phone)
  const temp = temperatureLabels[lead.temperature] ?? temperatureLabels.cold

  return (
    <div className="flex h-full flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">Contato</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleContactPanel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-minimal">
        {/* Avatar + identity */}
        <div className="flex flex-col items-center gap-2 border-b px-4 py-5">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarSrc} alt={displayName} />
            <AvatarFallback className="text-lg bg-secondary">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <p className="text-sm font-medium">{displayName}</p>
            <p className="text-xs text-muted-foreground">{lead.phone}</p>
            {isEvolution && lead.whatsapp_instance_name && (
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                <Phone className="inline h-2.5 w-2.5 mr-0.5" />
                {lead.whatsapp_instance_name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn('text-[10px] font-medium', temp.color)}>{temp.label}</span>
            {lead.ai_score > 0 && (
              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                Score: {lead.ai_score}
              </span>
            )}
          </div>
        </div>

        {/* Editable fields */}
        <div className="space-y-3 px-4 py-4 border-b">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border/50" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dados</span>
            <div className="h-px flex-1 bg-border/50" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Nome</Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); markDirty() }}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); markDirty() }}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Empresa</Label>
            <div className="relative">
              <Building2 className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={companyName}
                onChange={(e) => { setCompanyName(e.target.value); markDirty() }}
                className="h-8 pl-8 text-sm"
                placeholder="Empresa do cliente"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Instagram</Label>
              <div className="relative">
                <AtSign className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={instagramHandle}
                  onChange={(e) => { setInstagramHandle(e.target.value); markDirty() }}
                  className="h-8 pl-8 text-sm"
                  placeholder="@usuario"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">LinkedIn</Label>
              <div className="relative">
                <Link2 className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={linkedinUrl}
                  onChange={(e) => { setLinkedinUrl(e.target.value); markDirty() }}
                  className="h-8 pl-8 text-sm"
                  placeholder="URL"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Origem</Label>
            <Select value={sourceId} onValueChange={(v) => { setSourceId(v); markDirty() }}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {sources?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(isAdmin || isManager) && (
            <div className="space-y-1.5">
              <Label className="text-xs">Responsavel</Label>
              <Select value={assignedTo} onValueChange={(v) => { setAssignedTo(v); markDirty() }}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={assigneeName ?? 'Sem responsavel'} />
                </SelectTrigger>
                <SelectContent>
                  {eligibleMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!(isAdmin || isManager) && assigneeName && (
            <div className="space-y-1.5">
              <Label className="text-xs">Responsavel</Label>
              <p className="text-sm text-muted-foreground">{assigneeName}</p>
            </div>
          )}

          {/* Save button */}
          {dirty && (
            <Button
              size="sm"
              className="w-full h-8"
              onClick={handleSave}
              disabled={updateLead.isPending}
            >
              {updateLead.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Salvar
            </Button>
          )}
        </div>

        {/* Deals - reuse existing component */}
        <LeadDealsPanel leadId={lead.id} leadName={lead.name} />

        {/* Observations */}
        <div className="space-y-2 px-4 py-4 border-b">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border/50" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Observacoes</span>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          <textarea
            className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 input-clean resize-none"
            value={observations}
            onChange={(e) => { setObservations(e.target.value); markDirty() }}
            placeholder="Anotacoes sobre o contato..."
          />
        </div>

        {/* Tags */}
        <div className="space-y-2 px-4 py-4 border-b">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border/50" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tags</span>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          <LeadTagsInput
            value={tags}
            onChange={(newTags) => { setTags(newTags); markDirty() }}
          />
        </div>

        {/* Tasks */}
        <div className="space-y-2 px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <div className="h-px flex-1 bg-border/50" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tarefas</span>
              <div className="h-px flex-1 bg-border/50" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 ml-2 shrink-0"
              onClick={() => setCreateTaskOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {tasksLoading ? (
            <div className="flex h-16 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          ) : !tasks || tasks.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/60 text-center py-3">Nenhuma tarefa</p>
          ) : (
            <div className="space-y-1.5">
              {tasks.map((task) => {
                const Icon = taskTypeIcons[task.type]
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-md border border-border/30 p-2"
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10">
                      <Icon className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs truncate', task.status === 'done' && 'line-through text-muted-foreground')}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                        <span>{taskStatusLabels[task.status] ?? task.status}</span>
                        {task.due_date && (
                          <span>
                            {new Date(task.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                    {task.status !== 'done' && (
                      <button
                        onClick={() => completeTask.mutate(task.id)}
                        className="rounded p-0.5 text-muted-foreground hover:text-primary transition-smooth shrink-0"
                        title="Marcar como feita"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <CreateTaskModal
        open={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        defaultLeadId={lead.id}
      />
    </div>
  )
}

export { ContactPanel }
