import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { CampaignDraft, DraftPatch } from '@/lib/campaign-draft'
import type { WhatsAppTemplate } from '@/types/whatsapp-template'

interface TemplateMessageFieldsProps {
  draft: CampaignDraft
  onChange: (patch: DraftPatch) => void
  templates: WhatsAppTemplate[] | undefined
  body: string
  variables: string[]
  notApproved: boolean
}

export function TemplateMessageFields({ draft, onChange, templates, body, variables, notApproved }: TemplateMessageFieldsProps) {
  const selected = templates?.find((t) => t.id === draft.templateId)
  const setVar = (v: string, val: string) => onChange({ varMapping: { ...draft.varMapping, [v]: val } })

  return (
    <>
      <div className="space-y-1.5">
        <Label>Template</Label>
        <Select value={draft.templateId} onValueChange={(templateId) => onChange({ templateId })}>
          <SelectTrigger><SelectValue placeholder="Escolha um template" /></SelectTrigger>
          <SelectContent>
            {templates?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · {t.language}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {body && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Prévia</p>
          {body}
        </div>
      )}
      {notApproved && (
        <p className="text-sm text-destructive">Template não aprovado (status: {selected?.status}). O Cloud API só envia templates aprovados pela Meta.</p>
      )}
      {variables.length > 0 && (
        <div className="space-y-2">
          <Label>Variáveis do template</Label>
          {variables.map((v) => {
            const current = draft.varMapping[v] ?? 'lead.first_name'
            const isFixed = !current.startsWith('lead.')
            return (
              <div key={v} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-sm text-muted-foreground">{`{{${v}}}`}</span>
                <Select value={isFixed ? '__fixed__' : current} onValueChange={(val) => setVar(v, val === '__fixed__' ? '' : val)}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead.first_name">Primeiro nome</SelectItem>
                    <SelectItem value="lead.last_name">Sobrenome</SelectItem>
                    <SelectItem value="lead.name">Nome completo</SelectItem>
                    <SelectItem value="lead.company_name">Empresa do contato</SelectItem>
                    <SelectItem value="lead.phone">Telefone</SelectItem>
                    <SelectItem value="__fixed__">Texto fixo</SelectItem>
                  </SelectContent>
                </Select>
                {isFixed && <Input className="flex-1" placeholder="Texto fixo" value={current} onChange={(e) => setVar(v, e.target.value)} />}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
