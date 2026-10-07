import { Navigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAuthStore } from '@/stores/auth.store'
import { GroupsPanel } from '@/components/prospect/groups-panel'
import { SignalsQueue } from '@/components/prospect/signals-queue'
import { ShadowLabeling } from '@/components/prospect/shadow-labeling'
import { ProspectMetrics } from '@/components/prospect/prospect-metrics'

const ProspeccaoPage = () => {
  // Gate da feature oculta: fonte única = companies.features (mesma da edge/sidebar).
  const enabled = useAuthStore((s) => s.company?.features?.prospect_groups_enabled) === true
  if (!enabled) return <Navigate to="/" replace />

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Prospecção em grupos</h1>
        <p className="text-sm text-muted-foreground">Monitora grupos, classifica oportunidades e aborda com gate humano.</p>
      </div>

      <Tabs defaultValue="grupos">
        <TabsList>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
          <TabsTrigger value="fila">Fila de sinais</TabsTrigger>
          <TabsTrigger value="alerta">Alerta</TabsTrigger>
          <TabsTrigger value="sombra">Sombra</TabsTrigger>
          <TabsTrigger value="metricas">Métricas</TabsTrigger>
        </TabsList>
        <TabsContent value="grupos" className="mt-4"><GroupsPanel /></TabsContent>
        <TabsContent value="fila" className="mt-4"><SignalsQueue mode="review" /></TabsContent>
        <TabsContent value="alerta" className="mt-4"><SignalsQueue mode="alert" /></TabsContent>
        <TabsContent value="sombra" className="mt-4"><ShadowLabeling /></TabsContent>
        <TabsContent value="metricas" className="mt-4"><ProspectMetrics /></TabsContent>
      </Tabs>
    </div>
  )
}

export default ProspeccaoPage
