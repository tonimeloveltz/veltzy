import { useState } from 'react'
import { usePipelines } from '@/hooks/use-pipelines'
import { useAgentProfile } from '@/hooks/use-agent-profile'
import { useFirstCompanyLead } from '@/hooks/use-leads'
import { SdrV2Dashboard } from '@/components/sdr-v2/dashboard/SdrV2Dashboard'
import { AgentProfileWizard } from '@/components/sdr-v2/agent-profile-wizard/AgentProfileWizard'
import { AgentSandbox } from '@/components/sdr-v2/sandbox/AgentSandbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Settings, Power } from 'lucide-react'
import { useToggleAgentProfileActive } from '@/hooks/use-agent-profile'
import type { AgentProfile } from '@/types/sdr-v2'

const SdrIaPage = () => {
  // O acesso (role + flag sdr_agent_v2) e garantido pelo guard da rota
  // (ProtectedRoute + requireFeature). A pagina confia no guard e nao redireciona.
  const { data: pipelines } = usePipelines()
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | undefined>()
  const [showWizard, setShowWizard] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')
  const toggleActive = useToggleAgentProfileActive()

  const pipelineId = selectedPipelineId || pipelines?.[0]?.id
  const { data: agentProfile, refetch: refetchProfile } = useAgentProfile(pipelineId)

  // Lead de teste para o sandbox: primeiro lead REAL da empresa atual
  // (evita id hardcoded de outra empresa -> mismatch lead<->company).
  const { data: testLead } = useFirstCompanyLead()

  const handleWizardComplete = (_profile: AgentProfile) => {
    setShowWizard(false)
    refetchProfile()
  }

  const handleToggleActive = () => {
    if (!agentProfile) return
    toggleActive.mutate(
      { id: agentProfile.id, isActive: !agentProfile.is_active },
      { onSuccess: () => refetchProfile() },
    )
  }

  return (
    <div className="container max-w-7xl space-y-6 px-4 py-4 sm:px-8 sm:py-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Visão geral</TabsTrigger>
          <TabsTrigger value="config">Configuracao</TabsTrigger>
          <TabsTrigger value="sandbox">Sandbox</TabsTrigger>
        </TabsList>

        {/* Dashboard tab */}
        <TabsContent value="dashboard" className="mt-6">
          <SdrV2Dashboard />
        </TabsContent>

        {/* Config tab */}
        <TabsContent value="config" className="mt-6">
          <div className="space-y-4">
            {/* Pipeline selector */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={pipelineId || ''} onValueChange={setSelectedPipelineId}>
                <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Selecione um pipeline" /></SelectTrigger>
                <SelectContent>
                  {pipelines?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>

              {agentProfile && (
                <div className="flex gap-2">
                  <Button
                    variant={agentProfile.is_active ? 'destructive' : 'default'}
                    size="sm"
                    onClick={handleToggleActive}
                    disabled={toggleActive.isPending}
                    className="gap-1"
                  >
                    <Power className="h-3.5 w-3.5" />
                    {agentProfile.is_active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowWizard(true)} className="gap-1">
                    <Settings className="h-3.5 w-3.5" /> Editar
                  </Button>
                </div>
              )}
            </div>

            {/* Wizard or status */}
            {showWizard && pipelineId ? (
              <AgentProfileWizard
                pipelineId={pipelineId}
                existingProfile={agentProfile}
                onComplete={handleWizardComplete}
                onCancel={() => setShowWizard(false)}
              />
            ) : !agentProfile && pipelineId ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-4 py-12">
                  <p className="text-sm text-muted-foreground">
                    Este pipeline nao tem um Agent Profile configurado.
                  </p>
                  <Button onClick={() => setShowWizard(true)} className="gap-2">
                    <Plus className="h-4 w-4" /> Criar Agent Profile
                  </Button>
                </CardContent>
              </Card>
            ) : agentProfile && !showWizard ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <InfoItem label="Agente" value={agentProfile.agent_name} />
                    <InfoItem label="Tom" value={agentProfile.tone} />
                    <InfoItem label="Personalidade" value={agentProfile.personality} />
                    <InfoItem label="Proposito" value={agentProfile.purpose} />
                    <InfoItem label="Objetivo" value={agentProfile.primary_goal} />
                    <InfoItem label="Tools" value={agentProfile.enabled_tools.join(', ')} />
                    <InfoItem label="Knowledge Base" value={agentProfile.knowledge_base_status} />
                    <InfoItem label="Status" value={agentProfile.is_active ? 'Ativo' : 'Inativo'} />
                    <InfoItem label="Modo" value={agentProfile.operating_mode === 'full_auto' ? 'Full Auto' : 'Suggest'} />
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        {/* Sandbox tab */}
        <TabsContent value="sandbox" className="mt-6">
          {!agentProfile ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Configure um Agent Profile antes de usar o sandbox.
              </CardContent>
            </Card>
          ) : !testLead ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nenhum lead nesta empresa para testar. Crie um lead de teste
                para usar o sandbox.
              </CardContent>
            </Card>
          ) : (
            <AgentSandbox agentProfile={agentProfile} leadId={testLead.id} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

const InfoItem = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value}</p>
  </div>
)

export default SdrIaPage
