import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Search, MessageSquare, Download, Upload, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { leadDisplayName } from '@/lib/phone'
import { useContacts, type ContactRow } from '@/hooks/use-contacts'
import { useLeadSources } from '@/hooks/use-lead-sources'
import { useExportLeads } from '@/hooks/use-export-leads'
import { useRoles } from '@/hooks/use-roles'
import { leadTemperatureConfig } from '@/lib/lead-config'
import { LeadSourceBadge } from '@/components/pipeline/lead-source-badge'
import { ImportLeadsModal } from '@/components/pipeline/import-leads-modal'
import { NewContactModal } from '@/components/contacts/new-contact-modal'
import { IdentityCell } from '@/components/shared/identity-cell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { LeadTemperature } from '@/types/database'

const fmt = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const thClass = 'pb-3 text-xs font-medium text-muted-foreground'

const ContatosPage = () => {
  const navigate = useNavigate()
  const { isAdmin, isManager } = useRoles()
  const { data: contacts, isLoading, isError, refetch } = useContacts()
  const { data: sources } = useLeadSources()
  const { doExport, isExporting } = useExportLeads()

  const [search, setSearch] = useState('')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [temperature, setTemperature] = useState<LeadTemperature | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [newContactOpen, setNewContactOpen] = useState(false)
  const [editContact, setEditContact] = useState<ContactRow | null>(null)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (contacts ?? []).filter((c) => {
      if (sourceId && c.source_id !== sourceId) return false
      if (temperature && c.temperature !== temperature) return false
      if (q) {
        const haystack = `${c.name ?? ''} ${c.phone ?? ''} ${c.email ?? ''} ${c.company_name ?? ''}`.toLowerCase()
        // Telefone tambem por digitos: "5511" acha "+55 11 9...".
        const qDigits = q.replace(/\D/g, '')
        const phoneDigits = (c.phone ?? '').replace(/\D/g, '')
        const matches = haystack.includes(q) || (qDigits !== '' && phoneDigits.includes(qDigits))
        if (!matches) return false
      }
      return true
    })
  }, [contacts, search, sourceId, temperature])

  return (
    <div className="min-h-full p-4 sm:p-6">
      <div className="space-y-6 animate-fade-in">

        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Contatos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Todos os contatos da sua base
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar contato..."
                className="h-9 w-56 pl-9"
              />
            </div>
            <Select
              value={sourceId ?? 'all'}
              onValueChange={(v) => setSourceId(v === 'all' ? null : v)}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas origens</SelectItem>
                {sources?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={temperature ?? 'all'}
              onValueChange={(v) => setTemperature(v === 'all' ? null : (v as LeadTemperature))}
            >
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="Temperatura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas temps.</SelectItem>
                {(Object.keys(leadTemperatureConfig) as LeadTemperature[]).map((t) => (
                  <SelectItem key={t} value={t}>{leadTemperatureConfig[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(isAdmin || isManager) && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportModalOpen(true)} title="Importar contatos">
                <Download className="h-4 w-4" />
                Importar
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={isExporting} title="Exportar contatos">
                  <Upload className="h-4 w-4" />
                  Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => doExport('csv')}>Exportar CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport('xlsx')}>Exportar Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport('pdf')}>Exportar PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="gap-1.5" onClick={() => setNewContactOpen(true)}>
              <Plus className="h-4 w-4" />
              Novo Contato
            </Button>
          </div>
        </div>

        {/* TABELA */}
        <div className="glass-card rounded-xl p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  <th className={cn(thClass, 'text-left w-[30%]')}>Contato</th>
                  <th className={cn(thClass, 'text-left w-[18%]')}>Canal</th>
                  <th className={cn(thClass, 'text-left w-[10%]')}>Negocios</th>
                  <th className={cn(thClass, 'text-left w-[13%]')}>Valor total</th>
                  <th className={cn(thClass, 'text-left w-[12%]')}>Temperatura</th>
                  <th className={cn(thClass, 'text-left w-[13%]')}>Responsavel</th>
                  <th className={cn(thClass, 'text-left w-[4%]')}>Chat</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  [1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="border-b border-border/10">
                      <td colSpan={7} className="py-3"><Skeleton className="h-7 w-full" /></td>
                    </tr>
                  ))
                )}

                {isError && !isLoading && (
                  <tr>
                    <td colSpan={7} className="py-12">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <AlertCircle className="h-8 w-8 text-destructive" />
                        <p className="text-sm text-muted-foreground">Erro ao carregar contatos</p>
                        <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar novamente</Button>
                      </div>
                    </td>
                  </tr>
                )}

                {!isLoading && !isError && rows.map((c) => {
                  const temp = leadTemperatureConfig[c.temperature]
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setEditContact(c)}
                      className="border-b border-border/10 last:border-0 hover:bg-muted/20 transition-smooth cursor-pointer"
                    >
                      {/* Contato (identidade rica: nome + telefone no subtitulo) */}
                      <td className="py-3 text-left">
                        <IdentityCell
                          title={leadDisplayName(c.name, c.phone ?? '')}
                          subtitle={c.phone || null}
                          avatarUrl={c.avatar_url}
                        />
                      </td>

                      {/* Canal: origem + instancia */}
                      <td className="py-3 text-left">
                        {c.lead_sources ? (
                          <span className="inline-flex flex-col gap-0.5">
                            <LeadSourceBadge source={c.lead_sources} />
                            {c.whatsapp_instance_name && (
                              <span className="text-[10px] text-muted-foreground/60 truncate">{c.whatsapp_instance_name}</span>
                            )}
                          </span>
                        ) : c.whatsapp_instance_name ? (
                          <span className="text-[10px] text-muted-foreground/60 truncate">{c.whatsapp_instance_name}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">-</span>
                        )}
                      </td>

                      {/* Negocios (contagem, nao-clicavel) */}
                      <td className="py-3 text-left text-xs font-medium">{c.dealCount}</td>

                      {/* Valor total (LTV) */}
                      <td className="py-3 text-left font-semibold text-primary">
                        {c.ltv ? fmt(c.ltv) : <span className="text-muted-foreground/40 font-normal">-</span>}
                      </td>

                      {/* Temperatura (compacta) */}
                      <td className="py-3 text-left">
                        {temp && (
                          <span className="inline-flex items-center gap-1 text-[10px]" title={temp.label}>
                            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', temp.dotColor)} />
                            {temp.label}
                          </span>
                        )}
                      </td>

                      {/* Responsavel */}
                      <td className="py-3 text-left text-xs">
                        {c.profiles?.name ?? <span className="text-muted-foreground/40">Sem responsavel</span>}
                      </td>

                      {/* Chat */}
                      <td className="py-3 text-left">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/inbox?lead=${c.id}`) }}
                          className="inline-flex items-center text-muted-foreground hover:text-primary transition-smooth cursor-pointer"
                          title="Abrir conversa"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}

                {!isLoading && !isError && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      Nenhum contato encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ImportLeadsModal open={importModalOpen} onClose={() => setImportModalOpen(false)} />
      <NewContactModal open={newContactOpen} onClose={() => setNewContactOpen(false)} />
      <NewContactModal
        open={!!editContact}
        contact={editContact}
        onClose={() => setEditContact(null)}
      />
    </div>
  )
}

export default ContatosPage
