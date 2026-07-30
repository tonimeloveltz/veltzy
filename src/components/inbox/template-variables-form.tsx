import { useMemo, useState } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSendMessage } from '@/hooks/use-messages'
import { useLeadConsent } from '@/hooks/use-lead-consent'
import { LeadConsentDialog } from './lead-consent-dialog'
import type { TemplateComponent, WhatsAppTemplate } from '@/types/whatsapp-template'

interface TemplateVariablesFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: WhatsAppTemplate | null
  leadId: string
  onSent?: () => void
}

function getBodyText(t: WhatsAppTemplate | null): string {
  if (!t || !Array.isArray(t.components)) return ''
  const body = t.components.find((c: TemplateComponent) => c?.type === 'BODY')
  return (body?.text as string) ?? ''
}

function extractVars(text: string): number[] {
  const found = new Set<number>()
  for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) found.add(Number(m[1]))
  return [...found].sort((a, b) => a - b)
}

export const TemplateVariablesForm = ({
  open,
  onOpenChange,
  template,
  leadId,
  onSent,
}: TemplateVariablesFormProps) => {
  const send = useSendMessage()
  const isMarketing = template?.category === 'MARKETING'
  // Gate de MARKETING: consulta o opt-in valido; UTILITY/AUTH nao exigem.
  const consent = useLeadConsent(leadId, 'marketing_whatsapp')
  const [values, setValues] = useState<Record<number, string>>({})
  const [consentOpen, setConsentOpen] = useState(false)

  const text = getBodyText(template)
  const vars = useMemo(() => extractVars(text), [text])
  const preview = useMemo(
    () => text.replace(/\{\{(\d+)\}\}/g, (_, n) => values[Number(n)]?.trim() || `{{${n}}}`),
    [text, values],
  )

  const allFilled = vars.every((n) => (values[n] ?? '').trim().length > 0)
  // MARKETING so libera com consent PRESENTE (bloqueia inclusive durante o loading,
  // pra nao enviar as cegas). O CTA/banner aparece so quando ja SABEMOS que nao ha.
  const marketingReady = !isMarketing || !!consent.data
  const showConsentCta = !!isMarketing && !consent.data && !consent.isLoading
  const canSend = !!template && allFilled && marketingReady && !send.isPending

  const reset = () => setValues({})

  const handleSend = () => {
    if (!template || !marketingReady) return
    const parameters = vars.map((n) => values[n].trim())
    send.mutate(
      {
        leadId,
        content: preview,
        template: {
          templateId: template.meta_template_id ?? undefined,
          name: template.name,
          language: template.language,
          parameters,
        },
      },
      {
        onSuccess: () => {
          toast.success('Template enviado.')
          reset()
          onOpenChange(false)
          onSent?.()
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao enviar o template.'),
      },
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate">{template?.name ?? 'Template'}</DialogTitle>
            <DialogDescription>Preencha as variáveis e revise antes de enviar.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {vars.length > 0 && (
              <div className="space-y-2">
                {vars.map((n) => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="w-10 text-xs text-muted-foreground">{`{{${n}}}`}</span>
                    <Input
                      value={values[n] ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [n]: e.target.value }))}
                      placeholder={`Valor para {{${n}}}`}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Prévia</Label>
              <div className="whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {preview || 'Sem corpo.'}
              </div>
            </div>

            {showConsentCta && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1.5">
                  <p>Este contato não tem consentimento para marketing. Registre o opt-in ou use um template de utilidade.</p>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setConsentOpen(true)}>
                    Registrar opt-in
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSend} disabled={!canSend}>
              {send.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Enviar template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LeadConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        leadId={leadId}
        onGranted={() => consent.refetch()}
      />
    </>
  )
}
