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
import { LeadCadencePanel } from '@/components/inbox/lead-cadence-panel'
import { CreateTaskModal } from '@/components/tarefas/create-task-modal'
import { useUpdateLead } from '@/hooks/use-leads'
import { useLeadDetail } from '@/hooks/use-lead-detail'
import { useLeadSources } from '@/hooks/use-lead-sources'
import { useTeamMembers } from '@/hooks/use-team'
import { useLeadTasks, useCompleteTask } from '@/hooks/use-tasks'
import { useRoles } from '@/hooks/use-roles'
import { useWhatsAppStatus } from '@/hooks/use-whatsapp-status'
import { useInboxStore } from '@/stores/inbox.store'
import { useAuthStore } from '@/stores/auth.store'
import { leadDisplayName } from '@/lib/phone'
import { buildContactPanelPayload, type ContactPanelField } from '@/lib/contact-panel-payload'
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
  // O `lead` pode vir da RPC get_conversation_list, que nao traz todas as
  // colunas (company_name, instagram_handle, linkedin_url, first/last). Por isso:
  // (1) os campos sao semeados pelo detalhe do lead (select *) quando ele chega;
  // (2) o save manda SO os campos tocados (buildContactPanelPayload). Antes o
  // save mandava o objeto inteiro e gravava null por cima do que estava no banco.
  const { data: leadDetail } = useLeadDetail(lead.id)
  const [touched, setTouched] = useState<Set<ContactPanelField>>(() => new Set())
  const [firstName, setFirstName] = useState(lead.first_name ?? '')
  const [lastName, setLastName] = useState(lead.last_name ?? '')
  const requireFirstName = !!(leadDetail?.first_name ?? lead.first_name)
  const firstNameMissing = touched.has('first_name') && requireFirstName && firstName.trim() === ''
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
  const fieldValues = { firstName, lastName, email, companyName, instagramHandle, linkedinUrl, sourceId, assignedTo, tags }
  const fieldsRef = useRef({ values: fieldValues, touched, firstNameMissing })
  const leadIdRef = useRef(lead.id)

  dirtyRef.current = dirty
  fieldsRef.current = { values: fieldValues, touched, firstNameMissing }
  leadIdRef.current = lead.id

  // `leadId` explicito na troca de contato: quando o cleanup roda, o render do
  // contato NOVO ja atualizou leadIdRef, mas fieldsRef ainda tem os valores do
  // ANTIGO. Ler o ref aqui gravava as edicoes de um contato no outro.
  const flushFields = useCallback(async (leadId?: string) => {
    if (!dirtyRef.current || !companyId) return
    const f = fieldsRef.current
    const lid = leadId ?? leadIdRef.current
    dirtyRef.current = false
    const payload = buildContactPanelPayload(f.values, f.touched, f.firstNameMissing)
    if (Object.keys(payload).length === 0) return
    try {
      await updateLeadService(companyId, lid, payload)
      invalidateAll()
    } catch {
      // Non-critical
    }
  }, [companyId, invalidateAll])

  // Flush on lead change: salva no contato que estava aberto, capturado aqui.
  useEffect(() => {
    const openLeadId = lead.id
    return () => { flushFields(openLeadId); flushObservations() }
  }, [lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset local state to new lead
  useEffect(() => {
    setTouched(new Set())
    setFirstName(lead.first_name ?? '')
    setLastName(lead.last_name ?? '')
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

  // Semeia os campos pelo detalhe completo quando ele chega, sem sobrescrever o
  // que o usuario ja tocou. Observacoes so se nao ha edicao pendente.
  useEffect(() => {
    if (!leadDetail || leadDetail.id !== lead.id) return
    const t = touched
    if (!t.has('first_name') && !t.has('last_name')) {
      setFirstName(leadDetail.first_name ?? '')
      setLastName(leadDetail.last_name ?? '')
    }
    if (!t.has('email')) setEmail(leadDetail.email ?? '')
    if (!t.has('company_name')) setCompanyName(leadDetail.company_name ?? '')
    if (!t.has('instagram_handle')) setInstagramHandle(leadDetail.instagram_handle ?? '')
    if (!t.has('linkedin_url')) setLinkedinUrl(leadDetail.linkedin_url ?? '')
    if (!t.has('source_id')) setSourceId(leadDetail.source_id ?? '')
    if (!t.has('assigned_to')) setAssignedTo(leadDetail.assigned_to ?? '')
    if (!t.has('tags')) setTags(leadDetail.tags ?? [])
    if (!pendingObsRef.current) setObservations(leadDetail.observations ?? '')
  }, [leadDetail, lead.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const markDirty = (field: ContactPanelField) => {
    setTouched((prev) => (prev.has(field) ? prev : new Set(prev).add(field)))
    setDirty(true)
  }

  const handleSave = async () => {
    const data = buildContactPanelPayload(fieldValues, touched, firstNameMissing)
    if (Object.keys(data).length > 0) {
      await updateLead.mutateAsync({ leadId: lead.id, data })
      invalidateAll()
    }
    setDirty(false)
    setTouched(new Set())
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

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome{requireFirstName ? ' *' : ''}</Label>
              <Input
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); markDirty('first_name') }}
                className="h-8 text-sm"
              />
              {firstNameMissing && <p className="text-xs text-destructive">Nome obrigatorio</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sobrenome</Label>
              <Input
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); markDirty('last_name') }}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); markDirty('email') }}
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
                onChange={(e) => { setCompanyName(e.target.value); markDirty('company_name') }}
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
                  onChange={(e) => { setInstagramHandle(e.target.value); markDirty('instagram_handle') }}
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
                  onChange={(e) => { setLinkedinUrl(e.target.value); markDirty('linkedin_url') }}
                  className="h-8 pl-8 text-sm"
                  placeholder="URL"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Origem</Label>
            <Select value={sourceId} onValueChange={(v) => { setSourceId(v); markDirty('source_id') }}>
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
              <Select value={assignedTo} onValueChange={(v) => { setAssignedTo(v); markDirty('assigned_to') }}>
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

        {/* Cadencia */}
        <LeadCadencePanel leadId={lead.id} />

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
            onChange={(newTags) => { setTags(newTags); markDirty('tags') }}
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
