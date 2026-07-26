import { useState } from 'react'
import { Plus, Trash2, MessageCircle, UserPlus, Globe, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ColorPicker } from '@/components/shared/color-picker'
import { useAuthStore } from '@/stores/auth.store'
import { getAllLeadSources, createLeadSource, toggleLeadSourceActive, deleteLeadSource } from '@/services/lead-sources.service'
import type { CompanyFeatures } from '@/types/database'

const sourceIconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  instagram: Camera,
  whatsapp: MessageCircle,
  manual: UserPlus,
}

const getSourceIcon = (slug: string) => sourceIconMap[slug] ?? Globe

// Origens de sistema atreladas a um canal: so aparecem se o canal estiver habilitado
// em company.features (filtro UI-only; nao apaga nada no banco).
const CHANNEL_FLAG: Partial<Record<string, keyof CompanyFeatures>> = {
  instagram: 'instagram_enabled',
  // futuro: linkedin: 'linkedin_enabled', etc.
}

const LeadSourcesManager = () => {
  const company = useAuthStore((s) => s.company)
  const companyId = company?.id
  const queryClient = useQueryClient()

  const { data: sources, isLoading } = useQuery({
    queryKey: ['lead-sources-all', companyId],
    queryFn: () => getAllLeadSources(companyId!),
    enabled: !!companyId,
  })

  // Esconde origens de canal nao habilitado (ex.: Instagram sem instagram_enabled).
  // UI-only: WhatsApp/Manual/custom sempre aparecem; nada muda no banco.
  const visibleSources = sources?.filter((s) => {
    const flag = CHANNEL_FLAG[s.slug]
    return !flag || company?.features?.[flag] === true
  })

  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['lead-sources'] })
    queryClient.invalidateQueries({ queryKey: ['lead-sources-all'] })
  }

  const handleAdd = async () => {
    if (!newName.trim() || !companyId) return
    const slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    try {
      await createLeadSource(companyId, { name: newName, slug, color: newColor, icon_name: 'Globe' })
      invalidate()
      setNewName('')
      toast.success('Origem criada!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar origem')
    }
  }

  const handleToggleActive = async (id: string, active: boolean) => {
    if (!companyId) return
    try {
      await toggleLeadSourceActive(companyId, id, active)
      invalidate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar origem')
    }
  }

  const handleDelete = async (id: string, isSystem: boolean) => {
    if (isSystem) { toast.error('Origens do sistema não podem ser removidas'); return }
    if (!confirm('Remover esta origem?')) return
    if (!companyId) return
    try {
      await deleteLeadSource(companyId, id)
      invalidate()
      toast.success('Origem removida!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover origem')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Origens de Lead</CardTitle>
        <CardDescription>{"Origens que rotulam seus leads e alimentam os webhooks e as regras de 'Origem → funil'."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border/30 p-3">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-7 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {visibleSources?.map((s) => {
          const Icon = getSourceIcon(s.slug)
          return (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border/30 p-3">
              <Icon className="h-4 w-4 shrink-0" style={{ color: s.color }} />
              <span className="text-sm font-medium flex-1">{s.name}</span>
              {s.is_system && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Sistema</span>}
              <label className="relative inline-flex cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" checked={s.is_active} onChange={() => handleToggleActive(s.id, !s.is_active)} />
                <div className="peer h-4 w-7 rounded-full bg-muted-foreground/40 after:absolute after:left-[2px] after:top-[2px] after:h-3 after:w-3 after:rounded-full after:bg-background after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-3" />
              </label>
              {!s.is_system && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(s.id, s.is_system)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )
        })}

        <div className="flex items-center gap-2 pt-2 border-t">
          <ColorPicker value={newColor} onChange={setNewColor} />
          <Input placeholder="Nova origem..." value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdd()} className="h-8 flex-1" />
          <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}><Plus className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  )
}

export { LeadSourcesManager }
