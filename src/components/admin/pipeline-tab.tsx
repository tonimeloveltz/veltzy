import { useState, useEffect } from 'react'
import { StageManagerInline } from '@/components/admin/stage-manager-inline'
import { LeadSourcesManager } from '@/components/admin/lead-sources-manager'
import { PipelineListManager } from '@/components/admin/pipeline-list-manager'
import { PipelineSdrConfig } from '@/components/admin/pipeline-sdr-config'
import { PipelineRoutingRulesManager } from '@/components/admin/pipeline-routing-rules-manager'
import { usePipelines } from '@/hooks/use-pipelines'

const PipelineTab = () => {
  const { data: pipelines } = usePipelines()
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedPipelineId && pipelines && pipelines.length > 0) {
      const defaultP = pipelines.find((p) => p.is_default) ?? pipelines[0]
      setSelectedPipelineId(defaultP.id)
    }
  }, [pipelines, selectedPipelineId])

  return (
    <div className="space-y-6">
      <PipelineListManager
        selectedPipelineId={selectedPipelineId}
        onSelectPipeline={setSelectedPipelineId}
      />
      <StageManagerInline pipelineId={selectedPipelineId} />
      <PipelineSdrConfig pipelineId={selectedPipelineId} />
      <PipelineRoutingRulesManager pipelineId={selectedPipelineId} />
      <LeadSourcesManager />
    </div>
  )
}

export { PipelineTab }
