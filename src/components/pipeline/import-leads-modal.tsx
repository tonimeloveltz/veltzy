import { useState, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { UploadStep } from '@/components/pipeline/import-steps/upload-step'
import { MappingStep } from '@/components/pipeline/import-steps/mapping-step'
import { PreviewStep } from '@/components/pipeline/import-steps/preview-step'
import { ConfirmAssigneesStep } from '@/components/pipeline/import-steps/confirm-assignees-step'
import { ProgressStep } from '@/components/pipeline/import-steps/progress-step'
import { ResultStep } from '@/components/pipeline/import-steps/result-step'
import { useImportLeads, type ImportConfig } from '@/hooks/use-import-leads'
import { useTeamMembers } from '@/hooks/use-team'
import {
  resolveAssignees,
  needsAssigneeConfirmation,
  buildResolutionMap,
  applyAssigneeResolutions,
  type AssigneeResolution,
} from '@/services/resolve-assignees.service'
import type { ParsedCsv } from '@/lib/csv-parser'

type Step = 'upload' | 'mapping' | 'preview' | 'confirm-assignees' | 'progress' | 'result'

const STEP_TITLES: Record<Step, string> = {
  upload: 'Importar leads',
  mapping: 'Mapear colunas',
  preview: 'Confirmar importação',
  'confirm-assignees': 'Confirmar responsaveis',
  progress: 'Importando...',
  result: 'Importação concluída',
}

interface ImportLeadsModalProps {
  open: boolean
  onClose: () => void
}

const ImportLeadsModal = ({ open, onClose }: ImportLeadsModalProps) => {
  const [step, setStep] = useState<Step>('upload')
  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null)
  const [config, setConfig] = useState<ImportConfig | null>(null)
  const [assigneeResolutions, setAssigneeResolutions] = useState<AssigneeResolution[]>([])
  // resolutionMap não precisa de state — aplicado inline antes do import
  const { execute, progress, result, isPending, reset } = useImportLeads()
  const { data: members } = useTeamMembers()

  const handleClose = useCallback(() => {
    if (isPending) return
    setStep('upload')
    setParsedCsv(null)
    setConfig(null)
    setAssigneeResolutions([])
    reset()
    onClose()
  }, [isPending, onClose, reset])

  const handleUploadDone = (csv: ParsedCsv) => {
    setParsedCsv(csv)
    setStep('mapping')
  }

  const handleMappingDone = (importConfig: ImportConfig) => {
    setConfig(importConfig)
    setStep('preview')
  }

  const handlePreviewNext = () => {
    if (!parsedCsv || !config) return

    // Pre-flight scan para responsáveis
    const resolutions = resolveAssignees(
      parsedCsv.rows,
      config.columnMapping,
      members ?? [],
    )

    if (resolutions.length > 0 && needsAssigneeConfirmation(resolutions)) {
      setAssigneeResolutions(resolutions)
      setStep('confirm-assignees')
    } else {
      // Todos exatos ou sem coluna responsável — aplicar resoluções e importar
      if (resolutions.length > 0) {
        const map = buildResolutionMap(resolutions)
        applyAssigneeResolutions(parsedCsv.rows, config.columnMapping, map)
      }
      startImport()
    }
  }

  const handleAssigneesConfirmed = (resolved: AssigneeResolution[]) => {
    if (!parsedCsv || !config) return
    const map = buildResolutionMap(resolved)
    applyAssigneeResolutions(parsedCsv.rows, config.columnMapping, map)
    startImport()
  }

  const startImport = async () => {
    if (!parsedCsv || !config) return
    setStep('progress')
    await execute(parsedCsv, config)
    setStep('result')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="flex flex-col sm:max-w-2xl" onInteractOutside={(e) => isPending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{STEP_TITLES[step]}</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Selecione um arquivo CSV ou Excel (.xlsx) exportado de outro CRM ou planilha'}
            {step === 'mapping' && 'Associe as colunas do arquivo aos campos do lead'}
            {step === 'preview' && 'Verifique os dados antes de importar'}
            {step === 'confirm-assignees' && 'Revise os responsaveis antes de importar'}
            {step === 'progress' && 'Aguarde enquanto os leads sao importados'}
            {step === 'result' && 'Veja o resultado da importacao'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <UploadStep onNext={handleUploadDone} />
        )}

        {step === 'mapping' && parsedCsv && (
          <MappingStep
            headers={parsedCsv.headers}
            onNext={handleMappingDone}
            onBack={() => setStep('upload')}
          />
        )}

        {step === 'preview' && parsedCsv && config && (
          <PreviewStep
            parsedCsv={parsedCsv}
            config={config}
            onNext={handlePreviewNext}
            onBack={() => setStep('mapping')}
          />
        )}

        {step === 'confirm-assignees' && (
          <ConfirmAssigneesStep
            resolutions={assigneeResolutions}
            onConfirm={handleAssigneesConfirmed}
            onBack={() => setStep('preview')}
          />
        )}

        {step === 'progress' && (
          <ProgressStep progress={progress} />
        )}

        {step === 'result' && result && (
          <ResultStep result={result} onClose={handleClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

export { ImportLeadsModal }
