import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { useRoles } from '@/hooks/use-roles'
import * as tasksService from '@/services/tasks.service'
import type { TaskFilters, CreateTaskPayload, UpdateTaskPayload } from '@/services/tasks.service'
import type { TaskStatus } from '@/types/database'

export const useTasks = (filters?: Omit<TaskFilters, 'currentProfileId' | 'isAdminOrManager'>) => {
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)
  const { isManager } = useRoles()

  const fullFilters: TaskFilters = {
    ...filters,
    currentProfileId: profileId ?? undefined,
    isAdminOrManager: isManager,
  }

  return useQuery({
    queryKey: ['tasks', companyId, fullFilters],
    queryFn: () => tasksService.getTasks(companyId!, fullFilters),
    enabled: !!companyId,
    staleTime: 1000 * 30,
  })
}

export const useLeadTasks = (leadId: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['tasks', companyId, { leadId }],
    queryFn: () => tasksService.getTasks(companyId!, { leadId: leadId! }),
    enabled: !!companyId && !!leadId,
    staleTime: 1000 * 30,
  })
}

export const useTask = (taskId: string | null) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['task', companyId, taskId],
    queryFn: () => tasksService.getTaskById(companyId!, taskId!),
    enabled: !!companyId && !!taskId,
  })
}

/**
 * Exportada porque telas que criam tarefa sem usar `useCreateTask` (o dialogo
 * de agendamento do inbox, que precisa do proprio toast) ainda assim precisam
 * invalidar exatamente o mesmo conjunto.
 */
export const invalidateAllTasks = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.refetchQueries({ queryKey: ['tasks'] })
  queryClient.invalidateQueries({ queryKey: ['task-count'] })
}

export const useCreateTask = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (payload: CreateTaskPayload) => tasksService.createTask(companyId!, payload),
    onSuccess: () => {
      invalidateAllTasks(queryClient)
      toast.success('Tarefa criada')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao criar tarefa')
    },
  })
}

export const useUpdateTask = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: UpdateTaskPayload }) =>
      tasksService.updateTask(companyId!, taskId, data),
    onSuccess: () => {
      invalidateAllTasks(queryClient)
      toast.success('Tarefa atualizada')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao atualizar tarefa')
    },
  })
}

export const useDeleteTask = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (taskId: string) => tasksService.deleteTask(companyId!, taskId),
    onSuccess: () => {
      invalidateAllTasks(queryClient)
      toast.success('Tarefa removida')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao remover tarefa')
    },
  })
}

export const useCompleteTask = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (taskId: string) => tasksService.completeTask(companyId!, taskId),
    onSuccess: () => {
      invalidateAllTasks(queryClient)
      toast.success('Tarefa concluida')
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao concluir tarefa')
    },
  })
}

export const useUpdateTaskStatus = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      tasksService.updateTaskStatus(companyId!, taskId, status),
    onSuccess: () => {
      invalidateAllTasks(queryClient)
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro ao atualizar status')
    },
  })
}

export const useMyTaskCounts = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  const profileId = useAuthStore((s) => s.profile?.id)

  return useQuery({
    queryKey: ['my-task-counts', companyId, profileId],
    queryFn: async () => {
      const { data, error } = await import('@/lib/supabase').then((m) =>
        m.veltzy()
          .from('tasks')
          .select('id, status, due_date')
          .eq('company_id', companyId!)
          .eq('assigned_to', profileId!)
          .in('status', ['pending', 'in_progress']),
      )
      if (error) throw error
      const now = new Date()
      const pending = (data ?? []).length
      const overdue = (data ?? []).filter(
        (t) => t.due_date && new Date(t.due_date) < now,
      ).length
      return { pending, overdue }
    },
    enabled: !!companyId && !!profileId,
    staleTime: 1000 * 60,
  })
}

export const useLeadTaskCount = (leadId: string) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['task-count', companyId, leadId],
    queryFn: () => tasksService.getLeadTaskCount(companyId!, leadId),
    enabled: !!companyId && !!leadId,
    staleTime: 1000 * 60,
  })
}
