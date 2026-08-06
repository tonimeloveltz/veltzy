import { veltzy as db, supabase } from '@/lib/supabase'
import type { Task, TaskWithRelations, TaskStatus, TaskType } from '@/types/database'

export interface TaskFilters {
  assignedTo?: string
  status?: TaskStatus
  leadId?: string
  type?: TaskType
  search?: string
  /** Profile ID do usuario logado — usado para filtrar por role */
  currentProfileId?: string
  /** Se false, filtra apenas tarefas do usuario (seller/rep) */
  isAdminOrManager?: boolean
}

export interface CreateTaskPayload {
  lead_id?: string | null
  assigned_to?: string | null
  created_by?: string | null
  type: TaskType
  title: string
  description?: string | null
  due_date?: string | null
  meeting_date?: string | null
  meeting_duration?: number | null
  meeting_link?: string | null
  meeting_lead_email?: string | null
}

export interface UpdateTaskPayload {
  lead_id?: string | null
  assigned_to?: string | null
  type?: TaskType
  title?: string
  description?: string | null
  status?: TaskStatus
  due_date?: string | null
}

const SELECT_TASKS = `
  *,
  leads:lead_id(id, name, phone)
`

const enrichWithProfiles = async (tasks: Record<string, unknown>[]): Promise<TaskWithRelations[]> => {
  if (!tasks.length) return []

  const profileIds = [...new Set(
    tasks.map((t) => t.assigned_to as string).filter(Boolean),
  )]

  let profileMap: Record<string, { id: string; name: string; email: string }> = {}

  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', profileIds)
    if (profiles) {
      profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))
    }
  }

  return tasks.map((t) => ({
    ...t,
    profiles: t.assigned_to ? (profileMap[t.assigned_to as string] ?? null) : null,
  })) as TaskWithRelations[]
}

export const getTasks = async (
  companyId: string,
  filters?: TaskFilters,
): Promise<TaskWithRelations[]> => {
  const doneThreshold = new Date()
  doneThreshold.setDate(doneThreshold.getDate() - 30)

  let query = db()
    .from('tasks')
    .select(SELECT_TASKS)
    .eq('company_id', companyId)
    .neq('status', 'cancelled')
    .order('due_date', { ascending: true, nullsFirst: false })

  // Seller/rep: filtra apenas tarefas proprias (assigned_to ou created_by)
  if (filters?.currentProfileId && filters?.isAdminOrManager === false) {
    query = query.or(`assigned_to.eq.${filters.currentProfileId},created_by.eq.${filters.currentProfileId}`)
  }

  if (filters?.assignedTo) query = query.eq('assigned_to', filters.assignedTo)
  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.leadId) query = query.eq('lead_id', filters.leadId)
  if (filters?.type) query = query.eq('type', filters.type)
  if (filters?.search) query = query.ilike('title', `%${filters.search}%`)

  const { data, error } = await query
  if (error) throw error

  // Filtrar done antigos client-side (evita .or() complexo no PostgREST)
  const filtered = (data ?? []).filter((t) => {
    if (t.status !== 'done') return true
    return t.completed_at && new Date(t.completed_at) > doneThreshold
  })

  return enrichWithProfiles(filtered as Record<string, unknown>[])
}

export const getTaskById = async (
  companyId: string,
  taskId: string,
): Promise<TaskWithRelations> => {
  const { data, error } = await db()
    .from('tasks')
    .select(SELECT_TASKS)
    .eq('id', taskId)
    .eq('company_id', companyId)
    .single()
  if (error) throw error

  const [enriched] = await enrichWithProfiles([data as Record<string, unknown>])
  return enriched
}

export const createTask = async (
  companyId: string,
  payload: CreateTaskPayload,
): Promise<Task> => {
  const { data, error } = await db()
    .from('tasks')
    .insert({ company_id: companyId, ...payload })
    .select()
    .single()
  if (error) throw error

  // Sincronizacao com o Google Calendar NAO acontece aqui. Quem invoca a edge
  // function `calendar-event` e a tela que agenda, porque so ela sabe o que
  // fazer com "vendedor sem Google conectado". Embutir isso no service era o
  // que produzia o catch vazio que engolia toda falha de calendario.
  return data
}

export const updateTask = async (
  companyId: string,
  taskId: string,
  payload: UpdateTaskPayload,
): Promise<Task> => {
  const { data, error } = await db()
    .from('tasks')
    .update(payload)
    .eq('id', taskId)
    .eq('company_id', companyId)
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteTask = async (companyId: string, taskId: string): Promise<void> => {
  const { error } = await db()
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('company_id', companyId)
  if (error) throw error
}

export const completeTask = async (companyId: string, taskId: string): Promise<Task> => {
  const { data, error } = await db()
    .from('tasks')
    .update({ status: 'done' as TaskStatus, completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('company_id', companyId)
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateTaskStatus = async (
  companyId: string,
  taskId: string,
  status: TaskStatus,
): Promise<Task> => {
  const update: Record<string, unknown> = { status }
  if (status === 'done') update.completed_at = new Date().toISOString()
  if (status !== 'done') update.completed_at = null

  const { data, error } = await db()
    .from('tasks')
    .update(update)
    .eq('id', taskId)
    .eq('company_id', companyId)
    .select()
    .single()
  if (error) throw error
  return data
}

export const getLeadTaskCount = async (
  companyId: string,
  leadId: string,
): Promise<number> => {
  const { count, error } = await db()
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('lead_id', leadId)
    .in('status', ['pending', 'in_progress'])
  if (error) throw error
  return count ?? 0
}
