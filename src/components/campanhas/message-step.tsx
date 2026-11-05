import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth.store'
import { CampaignVariantsEditor } from '@/components/campanhas/campaign-variants-editor'
import { CampaignComposer, type ComposerMediaProps } from '@/components/campanhas/campaign-composer'
import { TemplateMessageFields } from '@/components/campanhas/template-message-fields'
import { Label } from '@/components/ui/label'
import { allVariantsReady } from '@/lib/campaign-variants'
import type { CampaignDraft, DraftPatch } from '@/lib/campaign-draft'
import type { WhatsAppTemplate } from '@/types/whatsapp-template'

interface MessageStepProps {
  draft: CampaignDraft
  onChange: (patch: DraftPatch) => void
  isCloudApi: boolean
  templates: WhatsAppTemplate[] | undefined
  templateBody: string
  templateVariables: string[]
  templateNotApproved: boolean
  /** Anexo no compositor (modo "Escrever agora", número não oficial). */
  media?: ComposerMediaProps
}

const modeButton = (on: boolean, disabled = false) => cn(
  'rounded-md border px-3 py-1.5 text-sm',
  on ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground',
  disabled && 'cursor-not-allowed opacity-50',
)

export function MessageStep({
  draft, onChange, isCloudApi, templates, templateBody, templateVariables, templateNotApproved, media,
}: MessageStepProps) {
  const aiEnabled = useAuthStore((s) => s.company?.features?.ai_msg_enabled) === true
  const { messageBody, variants } = draft

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button type="button" disabled={isCloudApi} onClick={() => onChange({ msgMode: 'free' })} className={modeButton(draft.msgMode === 'free', isCloudApi)}>
          Escrever agora
        </button>
        <button type="button" onClick={() => onChange({ msgMode: 'template' })} className={modeButton(draft.msgMode === 'template')}>
          Usar template
        </button>
      </div>
      {isCloudApi && (
        <p className="text-xs text-muted-foreground">Canal oficial (Cloud API) exige template aprovado pela Meta.</p>
      )}

      {draft.msgMode === 'free' && !isCloudApi && (
        <div className="space-y-1.5">
          <Label htmlFor="camp-body">Mensagem</Label>
          <CampaignComposer
            body={messageBody}
            // Versões derivam do texto anterior: mudou a original, descarta.
            onBodyChange={(text) => onChange(variants.length
              ? { messageBody: text, variants: [], variantsCleared: true }
              : { messageBody: text })}
            media={media}
          />
          {draft.variantsCleared && variants.length === 0 && (
            <p className="text-xs text-muted-foreground">A mensagem mudou, então as versões foram descartadas. Gere de novo se quiser.</p>
          )}
          <CampaignVariantsEditor
            original={messageBody}
            value={variants}
            onChange={(next) => onChange({ variants: next, variantsCleared: false })}
            aiEnabled={aiEnabled}
          />
          {variants.length > 0 && !allVariantsReady(messageBody, variants) && (
            <p className="text-xs text-muted-foreground">Aprove todas as versões para continuar.</p>
          )}
        </div>
      )}

      {draft.msgMode === 'template' && (
        <TemplateMessageFields
          draft={draft}
          onChange={onChange}
          templates={templates}
          body={templateBody}
          variables={templateVariables}
          notApproved={templateNotApproved}
        />
      )}
    </div>
  )
}
