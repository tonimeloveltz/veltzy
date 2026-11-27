import { PipelineSection } from '@/components/events/editor/pipeline/pipeline-section'
import { AssignmentSection } from '@/components/events/editor/pipeline/assignment-section'
import { QualificationRules } from '@/components/events/editor/pipeline/qualification-rules'
import { WhatsappSessionSection } from '@/components/events/editor/pipeline/whatsapp-session-section'
import { MessagesSection } from '@/components/events/editor/pipeline/messages-section'
import type { Event } from '@/types/events'

interface PipelineTabProps {
  event: Event
  savedQueue: string[]
  readOnly: boolean
  creatingPipeline: boolean
  onCreatePipeline: () => void
  onOpenForm: () => void
}

/** Aba 4: pipeline, tag e responsavel, qualificacao, sessao WAHA e mensagens. */
export const PipelineTab = (p: PipelineTabProps) => (
  <div className="space-y-4">
    <PipelineSection eventId={p.event.id} readOnly={p.readOnly} creating={p.creatingPipeline} onCreatePipeline={p.onCreatePipeline} />
    <AssignmentSection eventId={p.event.id} rrCursor={p.event.rr_cursor} savedQueue={p.savedQueue} />
    <QualificationRules onOpenForm={p.onOpenForm} />
    <WhatsappSessionSection readOnly={p.readOnly} />
    <MessagesSection timezone={p.event.timezone} savedStartsAt={p.event.starts_at} />
  </div>
)
