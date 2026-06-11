import { useState } from 'react'
import { Plus, Loader2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { MoreVertical } from 'lucide-react'
import { useTeamMembers, useInvites, useCancelInvite, useUpdateMemberRole } from '@/hooks/use-team'
import { PipelineAccessModal } from '@/components/sellers/pipeline-access-modal'
import { useFallbackOwner } from '@/hooks/use-fallback-owner'
import { useRoles } from '@/hooks/use-roles'
import { useAuthStore } from '@/stores/auth.store'
import { InviteMemberModal } from '@/components/sellers/invite-member-modal'
import { RemoveMemberModal } from '@/components/admin/remove-member-modal'
import { resetMemberPassword } from '@/services/team.service'
import { supabasePublic as supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { timeAgo } from '@/lib/time'
import type { AppRole } from '@/types/database'

const roleLabels: Record<string, string> = { admin: 'Admin', manager: 'Gestor', seller: 'Vendedor', super_admin: 'Super Admin' }
const roleBadge: Record<string, string> = { admin: 'bg-purple-500/10 text-purple-500', manager: 'bg-blue-500/10 text-blue-500', seller: 'bg-muted text-muted-foreground', super_admin: 'bg-red-500/10 text-red-500' }

const SellersTab = () => {
  const { data: members, isLoading } = useTeamMembers()
  const { data: invites } = useInvites()
  const cancelInvite = useCancelInvite()
  const updateRole = useUpdateMemberRole()
  const { fallbackOwnerId, setFallback } = useFallbackOwner()
  const { isAdmin, isManager } = useRoles()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ user_id: string; id: string; name: string } | null>(null)
  const [pipelineAccessTarget, setPipelineAccessTarget] = useState<{ user_id: string; name: string } | null>(null)

  const toggleAvailability = async (profileId: string, available: boolean) => {
    await supabase.from('profiles').update({ is_available: available }).eq('id', profileId)
    queryClient.invalidateQueries({ queryKey: ['team-members'] })
  }

  const handleResetPassword = async (email: string) => {
    try {
      await resetMemberPassword(email)
      toast.success(`Email de redefinicao enviado para ${email}`)
    } catch { toast.error('Erro ao enviar email') }
  }

  const managersAndAdmins = members?.filter((m) => {
    const role = m.user_roles?.[0]?.role
    return role === 'admin' || role === 'manager'
  })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Equipe</CardTitle>
              <CardDescription>Gerencie os membros da sua empresa</CardDescription>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Convidar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="pb-2 text-left font-medium text-muted-foreground">Membro</th>
                  <th className="pb-2 text-center font-medium text-muted-foreground">Funcao</th>
                  <th className="pb-2 text-center font-medium text-muted-foreground">Disponivel</th>
                  {isManager && <th className="pb-2 text-center font-medium text-muted-foreground">Pipelines</th>}
                  {isAdmin && <th className="pb-2 text-right font-medium text-muted-foreground">Acoes</th>}
                </tr>
              </thead>
              <tbody>
                {members?.map((m) => {
                  const role = m.user_roles?.[0]?.role ?? 'seller'
                  const initials = m.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                  const isSelf = m.user_id === currentUserId

                  return (
                    <tr key={m.id} className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-smooth">
                      <td className="py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{m.name}</p>
                            <p className="text-[10px] text-muted-foreground">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-center">
                        {isAdmin && !isSelf && role !== 'super_admin' ? (
                          <Select
                            value={role}
                            onValueChange={(v) => updateRole.mutate({ userId: m.user_id, role: v as AppRole })}
                          >
                            <SelectTrigger className="h-6 w-24 text-[10px] mx-auto"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="seller">Vendedor</SelectItem>
                              <SelectItem value="manager">Gestor</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', roleBadge[role])}>
                            {roleLabels[role]}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-center">
                        <label className="relative inline-flex cursor-pointer items-center">
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={m.is_available}
                            onChange={() => toggleAvailability(m.id, !m.is_available)}
                          />
                          <div className="peer h-4 w-7 rounded-full bg-muted-foreground/40 after:absolute after:left-[2px] after:top-[2px] after:h-3 after:w-3 after:rounded-full after:bg-background after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-3" />
                        </label>
                      </td>
                      {isManager && (
                        <td className="py-2.5 text-center">
                          {(role === 'seller' || role === 'representative') ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-6"
                              onClick={() => setPipelineAccessTarget({ user_id: m.user_id, name: m.name })}
                            >
                              Configurar
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Todos</span>
                          )}
                        </td>
                      )}
                      {isAdmin && (
                        <td className="py-2.5 text-right">
                          {!isSelf && role !== 'super_admin' && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6"><MoreVertical className="h-3.5 w-3.5" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleResetPassword(m.email)}>
                                  Redefinir Senha
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setRemoveMemberTarget({ user_id: m.user_id, id: m.id, name: m.name })}
                                >
                                  Remover da Empresa
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Responsavel Fallback</CardTitle>
            <CardDescription>Quando nenhum vendedor esta online, novos leads sao atribuidos a essa pessoa</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={fallbackOwnerId ?? 'none'}
              onValueChange={(v) => setFallback.mutate(v === 'none' ? null : v)}
            >
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum (desativado)</SelectItem>
                {managersAndAdmins?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name} ({m.user_roles?.[0]?.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {isAdmin && invites && invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Convites Pendentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invites.map((inv) => {
              const expired = new Date(inv.expires_at) < new Date()
              return (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border border-border/20 p-3 text-xs">
                  <div>
                    <p className="font-medium">{inv.email}</p>
                    <p className="text-muted-foreground">
                      {roleLabels[inv.role]} - {timeAgo(inv.created_at)}
                      {expired && <span className="ml-2 text-destructive">Expirado</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 gap-1"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/aceitar-convite?token=${inv.token}`)
                        toast.success('Link copiado!')
                      }}
                    >
                      <Copy className="h-3 w-3" />
                      Copiar link
                    </Button>
                    <Button variant="ghost" size="sm" className="text-xs text-destructive h-6" onClick={() => cancelInvite.mutate(inv.id)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      <InviteMemberModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <RemoveMemberModal
        open={!!removeMemberTarget}
        onOpenChange={(open) => { if (!open) setRemoveMemberTarget(null) }}
        member={removeMemberTarget}
      />
      <PipelineAccessModal
        open={!!pipelineAccessTarget}
        onOpenChange={(open) => { if (!open) setPipelineAccessTarget(null) }}
        member={pipelineAccessTarget}
      />
    </div>
  )
}

export { SellersTab }
