import { FormProvider } from 'react-hook-form'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EditorHeader } from '@/components/events/editor/editor-header'
import { PublishChecklistCard } from '@/components/events/editor/publish-checklist-card'
import { LeaveConfirmDialog } from '@/components/events/editor/leave-confirm-dialog'
import { OverviewTab } from '@/components/events/editor/overview/overview-tab'
import { FormTab } from '@/components/events/editor/form/form-tab'
import { AppearanceTab } from '@/components/events/editor/appearance/appearance-tab'
import { PipelineTab } from '@/components/events/editor/pipeline/pipeline-tab'
import { useEventEditor } from '@/hooks/events/use-event-editor'
import { useRoles } from '@/hooks/use-roles'
import { useAuthStore } from '@/stores/auth.store'
import type { EditorTab } from '@/lib/events/publish-checklist'
import type { Event, EventFormField } from '@/types/events'

const TABS: Array<{ value: EditorTab; label: string }> = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'form', label: 'Formulário de inscrição' },
  { value: 'appearance', label: 'Aparência' },
  { value: 'pipeline', label: 'Pipeline e automações' },
]

interface EventEditorProps {
  event: Event
  fields: EventFormField[]
  assignees: string[]
}

export const EventEditor = ({ event, fields, assignees }: EventEditorProps) => {
  const { isManager } = useRoles()
  const readOnly = !isManager
  const companyName = useAuthStore((s) => s.company?.name ?? '')
  const ed = useEventEditor(event, fields, assignees)

  return (
    <FormProvider {...ed.form}>
      <div className="space-y-4 p-4 md:p-6">
        <EditorHeader event={event} title={ed.title} isDirty={ed.isDirty} readOnly={readOnly}
          saving={ed.saving} publishing={ed.publishing} onSave={ed.onSave} onPublish={ed.onPublish}
          onUnpublish={ed.onUnpublish} onNavigate={ed.leave.request} />
        {readOnly && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Modo leitura: só administradores e gestores editam o evento.
          </p>
        )}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <Tabs value={ed.tab} onValueChange={(v) => ed.setTab(v as EditorTab)} className="min-w-0">
            <TabsList className="h-auto flex-wrap justify-start">
              {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
            </TabsList>
            <fieldset disabled={readOnly} className="mt-4 min-w-0">
              <TabsContent value="overview" className="mt-0">
                <OverviewTab event={event} companyName={companyName} />
              </TabsContent>
              <TabsContent value="form" className="mt-0">
                <FormTab eventId={event.id} companyName={companyName} readOnly={readOnly} />
              </TabsContent>
              <TabsContent value="appearance" className="mt-0">
                <AppearanceTab eventId={event.id} timezone={event.timezone} companyName={companyName} />
              </TabsContent>
              <TabsContent value="pipeline" className="mt-0">
                <PipelineTab event={event} savedQueue={assignees} readOnly={readOnly}
                  creatingPipeline={ed.creatingPipeline} onCreatePipeline={ed.onCreatePipeline} onOpenForm={() => ed.setTab('form')} />
              </TabsContent>
            </fieldset>
          </Tabs>
          {!readOnly && (
            <div className="order-first xl:order-none xl:sticky xl:top-4 xl:self-start">
              <PublishChecklistCard items={ed.items} missing={ed.missing} onGo={ed.goTo} />
            </div>
          )}
        </div>
        <LeaveConfirmDialog open={ed.leave.open} onConfirm={ed.leave.confirm} onCancel={ed.leave.cancel} />
      </div>
    </FormProvider>
  )
}
