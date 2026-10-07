import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useProspectGroups, useProspectConfig, useSetCompanyEnabled, useRegisterGroup, useUpdateGroup,
} from '@/hooks/use-prospect-groups'

export const GroupsPanel = () => {
  const { data: config } = useProspectConfig()
  const { data: groups, isLoading } = useProspectGroups()
  const setEnabled = useSetCompanyEnabled()
  const register = useRegisterGroup()
  const update = useUpdateGroup()
  const [form, setForm] = useState({ name: '', invite_code: '', niche: '', session_name: '' })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Kill switch da empresa</CardTitle>
          <CardDescription>Desliga toda a prospecção desta empresa. Só super admin consegue alterar.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch checked={config?.is_enabled ?? false} onCheckedChange={(v) => setEnabled.mutate(v)} />
          <span className="text-sm text-muted-foreground">
            {config?.is_enabled ? 'Ligado' : 'Desligado'}
            {config?.shadow_mode ? ' · modo sombra (não envia nada)' : ''}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registrar grupo</CardTitle>
          <CardDescription>Registra um grupo monitorado. A entrada no grupo pelo link de convite é feita pela infra de WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Sessão (session_name)</Label>
            <Input value={form.session_name} onChange={(e) => setForm({ ...form, session_name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Nicho</Label>
            <Input value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Código do convite</Label>
            <Input value={form.invite_code} onChange={(e) => setForm({ ...form, invite_code: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Button
              disabled={!form.name || !form.session_name || register.isPending}
              onClick={() => register.mutate(
                { name: form.name, session_name: form.session_name, niche: form.niche || null, invite_code: form.invite_code || null },
                { onSuccess: () => setForm({ name: '', invite_code: '', niche: '', session_name: '' }) },
              )}
            >
              Registrar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Grupos monitorados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : groups?.length ? (
            groups.map((g) => (
              <div key={g.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{g.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {g.niche ?? 'sem nicho'} · {g.messages_read} lidas · {g.session_name}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{g.is_active ? 'ativo' : 'inativo'}</span>
                  <Switch checked={g.is_active} onCheckedChange={(v) => update.mutate({ id: g.id, patch: { is_active: v } })} />
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum grupo registrado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
