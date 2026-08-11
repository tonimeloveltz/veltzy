import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { IntegrationsTab } from '@/components/admin/integrations-tab'
import { PipelineTab } from '@/components/admin/pipeline-tab'
import { ThemeCustomizer } from '@/components/company/theme-customizer'
import { ActivityLogsDashboard } from '@/components/admin/activity-logs-dashboard'
import { BusinessRulesTab } from '@/components/admin/business-rules-tab'
import { useAuthStore } from '@/stores/auth.store'

const EmpresaTab = () => {
  const company = useAuthStore((s) => s.company)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da Empresa</CardTitle>
        <CardDescription>Informações da sua empresa</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-muted-foreground">Nome</Label>
            <p className="text-sm font-medium">{company?.name ?? '-'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground">Slug (URL)</Label>
            <p className="text-sm font-medium">{company?.slug ?? '-'}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Para alterar os dados da empresa, entre em contato com o suporte.
        </p>
      </CardContent>
    </Card>
  )
}

const AdminPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'integracoes'

  return (
    <div className="space-y-6 animate-fade-in p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Admin</h1>

      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="regras">Regras</TabsTrigger>
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
          <TabsTrigger value="aparencia">Aparência</TabsTrigger>
          <TabsTrigger value="logs-avancados">Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="integracoes" className="mt-4"><IntegrationsTab /></TabsContent>
        <TabsContent value="pipeline" className="mt-4"><PipelineTab /></TabsContent>
        <TabsContent value="regras" className="mt-4"><BusinessRulesTab /></TabsContent>
        <TabsContent value="empresa" className="mt-4"><EmpresaTab /></TabsContent>
        <TabsContent value="aparencia" className="mt-4"><ThemeCustomizer /></TabsContent>
        <TabsContent value="logs-avancados" className="mt-4"><ActivityLogsDashboard /></TabsContent>
      </Tabs>
    </div>
  )
}

export default AdminPage
