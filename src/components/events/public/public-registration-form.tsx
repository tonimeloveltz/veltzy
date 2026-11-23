import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { RegistrationFormFields } from '@/components/events/public/registration-form-fields'
import { ConsentCheckboxes } from '@/components/events/public/consent-checkboxes'
import { submitRegistration } from '@/services/event-public.service'
import { answersPayload, emptyRegistration } from '@/lib/events/registration-form'
import { eventButtonStyle } from '@/lib/events/event-theme'
import { readTracking } from '@/lib/events/public-event'
import type { EventPublic } from '@/types/events'

const MESSAGE: Record<string, string> = {
  duplicate: 'Este WhatsApp já está inscrito. Reenviamos a confirmação no seu WhatsApp.',
  rate_limited: 'Muitas tentativas. Tente de novo em alguns minutos.',
  rejected: 'Não foi possível enviar a inscrição. Tente de novo.',
  error: 'Não foi possível enviar a inscrição. Tente de novo.',
  not_found: 'Evento não encontrado.',
}
const STATE_RESULTS = new Set(['sold_out', 'closed', 'not_open', 'finished', 'canceled'])

export const PublicRegistrationForm = ({ event }: { event: EventPublic }) => {
  const navigate = useNavigate()
  const qc = useQueryClient()
  // Montagem do formulario: tempo minimo do anti-robo e chave de idempotencia mantida entre tentativas.
  const [renderedAt] = useState(() => Date.now())
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [tracking] = useState(() => readTracking(window.location.search, document.referrer))
  const [values, setValues] = useState(emptyRegistration)
  const [consent, setConsent] = useState({ privacy: false, marketing: false })
  const [honeypot, setHoneypot] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setNotice(null)
    if (!consent.privacy) { setErrors({ consent_privacy: 'required' }); return }
    setSending(true)
    const r = await submitRegistration({
      slug: event.slug, rendered_at: renderedAt, website: honeypot, idempotency_key: idempotencyKey,
      first_name: values.first_name, last_name: values.last_name || null, email: values.email || null,
      whatsapp: values.whatsapp, answers: answersPayload(event.fields, values),
      consent_privacy: consent.privacy, consent_marketing: consent.marketing, ...tracking,
    }).catch(() => ({ result: 'error' as const }))
    setSending(false)
    if (r.result === 'ok') { navigate(`/e/${event.slug}/i/${r.token}`); return }
    if (r.result === 'validation') { setErrors(r.errors); return }
    if (STATE_RESULTS.has(r.result)) { qc.invalidateQueries({ queryKey: ['public-event', event.slug] }); return }
    setErrors({})
    setNotice(MESSAGE[r.result] ?? MESSAGE.error)
  }

  return (
    <form id="inscricao" onSubmit={submit} noValidate className="relative space-y-4">
      <RegistrationFormFields fields={event.fields} values={values} errors={errors} onChange={setValues} />
      {/* Honeypot: invisivel para pessoas; robo que preenche e recusado no servidor. */}
      <input type="text" name="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-10000px' }} />
      <ConsentCheckboxes privacyUrl={event.privacy_policy_url} organizer={event.organizer.name} privacy={consent.privacy}
        marketing={consent.marketing} privacyError={!!errors.consent_privacy} onChange={setConsent} />
      {notice && <p role="status" className="rounded-md border px-3 py-2 text-sm">{notice}</p>}
      <button type="submit" disabled={sending} style={eventButtonStyle(event.appearance)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-md text-base font-semibold disabled:opacity-60">
        {sending && <Loader2 className="h-4 w-4 animate-spin" />} Quero me inscrever
      </button>
    </form>
  )
}
