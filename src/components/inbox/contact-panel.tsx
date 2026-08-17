import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
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
import { useAuthStore } from '@/stores/auth.store'
import { leadDisplayName } from '@/lib/phone'
import { updateLead as updateLeadService } from '@/services/leads.service'
import { leadTemperatureConfig } from '@/lib/lead-config'
import type { LeadWithLastMessage, TaskType } from '@/types/database'

// --- Task config ---
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

// --- Section header helper ---
const SectionHeader = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 pb-2">
    <div className="h-px flex-1 bg-border/50" />
    <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-medium select-none">
      {label}
    </span>
    <div className="h-px flex-1 bg-border/50" />
  </div>
)

interface ContactPanelProps {
  lead: LeadWithLastMessage
}

type ObsSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const ContactPanel = ({ lead }: ContactPanelProps) => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)
  const updateLead = useUpdateLead()
  const { data: sources } = useLeadSources()
  const { data: members } = useTeamMembers()
  const { data: tasks, isLoading: tasksLoading } = useLeadTasks(lead.id)
  const completeTask = useCompleteTask()
  const { isAdmin, isManager } = useRoles()
  const { data: waStatus } = useWhatsAppStatus()
  const showInstanceBadge = waStatus?.provider === 'evolution' || waStatus?.provider === 'cloud_api'
  const setContactPanelOpen = useInboxStore((s) => s.setContactPanelOpen)

  const [createTaskOpen, setCreateTaskOpen] = useState(false)

  // --- Editable fields (non-observations) ---
  const [name, setName] = useState(lead.name ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [companyName, setCompanyName] = useState(lead.company_name ?? '')
  const [instagramHandle, setInstagramHandle] = useState(lead.instagram_handle ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(lead.linkedin_url ?? '')
  const [sourceId, setSourceId] = useState(lead.source_id ?? '')
  const [assignedTo, setAssignedTo] = useState(lead.assigned_to ?? '')
  const [tags, setTags] = useState<string[]>(lead.tags ?? [])
  const [dirty, setDirty] = useState(false)

  // --- Observations with auto-save ---
  const [observations, setObservations] = useState(lead.observations ?? '')
  const [obsSaveStatus, setObsSaveStatus] = useState<ObsSaveStatus>('idle')
  const obsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingObsRef = useRef<{ leadId: string; text: string } | null>(null)

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['leads'] })
    queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }, [queryClient])

  // Flush pending observations save
  const flushObservations = useCallback(async () => {
    if (obsTimerRef.current) { clearTimeout(obsTimerRef.current); obsTimerRef.current = null }
    const pending = pendingObsRef.current
    if (!pending || !companyId) return
    pendingObsRef.current = null
    setObsSaveStatus('saving')
    try {
      await updateLeadService(companyId, pending.leadId, { observations: pending.text || null })
      invalidateAll()
      setObsSaveStatus('saved')
    } catch {
      setObsSaveStatus('error')
    }
  }, [companyId, invalidateAll])

  const scheduleObsSave = useCallback((text: string, leadId: string) => {
    if (obsTimerRef.current) clearTimeout(obsTimerRef.current)
    pendingObsRef.current = { leadId, text }
    obsTimerRef.current = setTimeout(() => flushObservations(), 1000)
  }, [flushObservations])

  const handleObservationsChange = (text: string) => {
    setObservations(text)
    setObsSaveStatus('idle')
    scheduleObsSave(text, lead.id)
  }

  // --- Flush all dirty fields ---
  const dirtyRef = useRef(false)
  const fieldsRef = useRef({ name, email, companyName, instagramHandle, linkedinUrl, sourceId, assignedTo, tags })
  const leadIdRef = useRef(lead.id)

  dirtyRef.current = dirty
  fieldsRef.current = { name, email, companyName, instagramHandle, linkedinUrl, sourceId, assignedTo, tags }
  leadIdRef.current = lead.id

  const flushFields = useCallback(async () => {
    if (!dirtyRef.current || !companyId) return
    const f = fieldsRef.current
    const lid = leadIdRef.current
    dirtyRef.current = false
    try {
      await updateLeadService(companyId, lid, {
        name: f.name || null,
        email: f.email || null,
        company_name: f.companyName || null,
        instagram_handle: f.instagramHandle || null,
        linkedin_url: f.linkedinUrl || null,
        source_id: f.sourceId || null,
        assigned_to: f.assignedTo || null,
        tags: f.tags,
      })
      invalidateAll()
    } catch {
      // Non-critical
    }
  }, [companyId, invalidateAll])

  // Flush on lead change
  useEffect(() => {
    return () => { flushFields(); flushObservations() }
  }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset local state to new lead
  useEffect(() => {
    setName(lead.name ?? '')
    setEmail(lead.email ?? '')
    setCompanyName(lead.company_name ?? '')
    setInstagramHandle(lead.instagram_handle ?? '')
    setLinkedinUrl(lead.linkedin_url ?? '')
    setSourceId(lead.source_id ?? '')
    setAssignedTo(lead.assigned_to ?? '')
    setTags(lead.tags ?? [])
    setObservations(lead.observations ?? '')
    setDirty(false)
    setObsSaveStatus('idle')
    pendingObsRef.current = null
  }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Flush on unmount
  useEffect(() => {
    return () => { flushFields(); flushObservations() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear "Salvo" after 2s
  useEffect(() => {
    if (obsSaveStatus === 'saved') {
      const t = setTimeout(() => setObsSaveStatus('idle'), 2000)
      return () => clearTimeout(t)
    }
  }, [obsSaveStatus])

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
        tags,
      },
    })
    invalidateAll()
    setDirty(false)
  }

  const handleClose = () => {
    flushFields()
    flushObservations()
    setContactPanelOpen(false)
  }

  const eligibleMembers = members?.filter((m) =>
    m.user_roles?.some((r) => ['admin', 'manager', 'seller', 'super_admin'].includes(r.role))
  ) ?? []

  const assigneeName = assignedTo
    ? members?.find((m) => m.id === assignedTo)?.name ?? null
    : null

  const avatarSrc = lead.avatar_url || undefined
  const displayName = leadDisplayName(lead.name, lead.phone)

  return (
    <div className="flex h-full flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-semibold">Contato</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-minimal">
        {/* Compact header: avatar left + info right */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarImage src={avatarSrc} alt={displayName} />
            <AvatarFallback className="text-base bg-secondary">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground">{lead.phone}</p>
            {showInstanceBadge && lead.whatsapp_instance_name && (
              <p className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5 mt-0.5">
                <Phone className="h-2.5 w-2.5" />
                {lead.whatsapp_instance_name}
              </p>
            )}
            {lead.ai_score > 0 && (
              <span className="inline-block mt-1 text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                Score: {lead.ai_score}
              </span>
            )}
          </div>
        </div>

        {/* Temperature bar (same as pipeline cards) */}
        <div className="px-4 py-3 border-b">
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: leadTemperatureConfig[lead.temperature].width, background: leadTemperatureConfig[lead.temperature].gradient }}
              />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground shrink-0">
              {leadTemperatureConfig[lead.temperature].label}
            </span>
          </div>
        </div>

        {/* Editable fields */}
        <div className="space-y-3 px-4 py-4 border-b">
          <SectionHeader label="Dados" />

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

        {/* Deals */}
        <LeadDealsPanel leadId={lead.id} leadName={lead.name} />

        {/* Observations - auto-save */}
        <div className="px-4 py-4 border-b space-y-2">
          <div className="flex items-center gap-2">
            <SectionHeader label="Observacoes" />
            {obsSaveStatus === 'saving' && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Salvando...
              </span>
            )}
            {obsSaveStatus === 'saved' && (
              <span className="text-[10px] text-emerald-500 shrink-0">Salvo</span>
            )}
            {obsSaveStatus === 'error' && (
              <span className="text-[10px] text-destructive shrink-0">Erro ao salvar</span>
            )}
          </div>
          <textarea
            className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 input-clean resize-none"
            value={observations}
            onChange={(e) => handleObservationsChange(e.target.value)}
            onBlur={() => flushObservations()}
            placeholder="Anotacoes sobre o contato..."
          />
        </div>

        {/* Tags */}
        <div className="px-4 py-4 border-b space-y-2">
          <SectionHeader label="Tags" />
          <LeadTagsInput
            value={tags}
            onChange={(newTags) => { setTags(newTags); markDirty() }}
          />
        </div>

        {/* Tasks */}
        <div className="px-4 py-4 space-y-2">
          <div className="flex items-center justify-between">
            <SectionHeader label="Tarefas" />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
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
