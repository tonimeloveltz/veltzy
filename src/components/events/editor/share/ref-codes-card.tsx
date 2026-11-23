import { useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EditorSection } from '@/components/events/editor/editor-section'
import { useEventRefCodes } from '@/hooks/events/use-event-ref-codes'
import { useSaveRefCode } from '@/hooks/events/use-save-ref-code'
import { copyText } from '@/lib/events/copy-event-link'
import { isValidRefCode, refCodeFromLabel, trackedUrl } from '@/lib/events/share-text'
import type { RegistrationRow } from '@/lib/events/registration-view'

interface RefCodesCardProps {
  eventId: string
  url: string
  registrations: RegistrationRow[]
  canEdit: boolean
}

const tally = (rows: RegistrationRow[], match: (r: RegistrationRow) => boolean) => {
  const mine = rows.filter((r) => r.status !== 'canceled' && match(r))
  return { registered: mine.length, attended: mine.filter((r) => r.status === 'attended').length }
}

const Row = ({ label, link, stats, onDelete }: {
  label: string; link: string; stats: { registered: number; attended: number }; onDelete?: () => void
}) => (
  <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
    <span className="min-w-0 flex-1 font-medium">{label}</span>
    <span className="text-xs text-muted-foreground">{stats.registered} inscritos · {stats.attended} presentes</span>
    <Button type="button" variant="ghost" size="sm" onClick={() => copyText(link, 'Link copiado.')}>
      <Copy className="h-4 w-4" /> Link
    </Button>
    {onDelete && (
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Excluir ${label}`} onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    )}
  </li>
)

/** Codigos de divulgador: link com ?ref=, inscritos e presentes por codigo. */
export const RefCodesCard = ({ eventId, url, registrations, canEdit }: RefCodesCardProps) => {
  const { data: codes = [] } = useEventRefCodes(eventId)
  const save = useSaveRefCode(eventId)
  const [label, setLabel] = useState('')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const effectiveCode = codeTouched ? code : refCodeFromLabel(label)
  const valid = label.trim().length > 0 && isValidRefCode(effectiveCode)

  const add = () => save.mutate({ kind: 'create', label, code: effectiveCode }, {
    onSuccess: () => { setLabel(''); setCode(''); setCodeTouched(false) },
  })

  return (
    <EditorSection title="Divulgadores" description="Cada pessoa ou canal ganha um link próprio. A origem fica no inscrito e no negócio.">
      <ul className="divide-y rounded-md border">
        <Row label="Link direto (sem código)" link={url} stats={tally(registrations, (r) => !r.ref_code)} />
        {codes.map((c) => (
          <Row key={c.id} label={`${c.label} · ${c.code}`} link={trackedUrl(url, { ref: c.code })}
            stats={tally(registrations, (r) => r.ref_code === c.code)}
            onDelete={canEdit ? () => save.mutate({ kind: 'delete', id: c.id }) : undefined} />
        ))}
      </ul>
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <Input className="min-w-[180px] flex-1" placeholder="Nome (ex.: Ana, Instagram)" value={label} maxLength={80}
            onChange={(e) => setLabel(e.target.value)} aria-label="Nome do divulgador" />
          <Input className="w-44 font-mono" placeholder="codigo" value={effectiveCode} maxLength={40} aria-label="Código"
            onChange={(e) => { setCodeTouched(true); setCode(e.target.value.toLowerCase()) }} />
          <Button type="button" variant="outline" onClick={add} disabled={!valid || save.isPending}>
            <Plus className="h-4 w-4" /> Criar código
          </Button>
        </div>
      )}
      {canEdit && effectiveCode && !isValidRefCode(effectiveCode) && (
        <p className="text-xs text-destructive">Código só com letras minúsculas, números e hífens (até 40).</p>
      )}
    </EditorSection>
  )
}
