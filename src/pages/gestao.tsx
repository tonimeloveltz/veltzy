import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SellersTab } from '@/components/admin/sellers-tab'
import { GoalsManager } from '@/components/gestao/goals-manager'
import { ScriptsManager } from '@/components/settings/scripts-manager'
import { AutoReplySettings } from '@/components/settings/auto-reply-settings'
import { ReportsTab } from '@/components/admin/reports-tab'

const GestaoPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'vendedores'

  return (
    <div className="space-y-6 animate-fade-in p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Gestão</h1>

      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
          <TabsTrigger value="metas">Metas</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
          <TabsTrigger value="auto-reply">Auto-Reply</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
        </TabsList>
        <TabsContent value="vendedores" className="mt-4"><SellersTab /></TabsContent>
        <TabsContent value="metas" className="mt-4"><GoalsManager /></TabsContent>
        <TabsContent value="scripts" className="mt-4"><ScriptsManager /></TabsContent>
        <TabsContent value="auto-reply" className="mt-4"><AutoReplySettings /></TabsContent>
        <TabsContent value="relatorios" className="mt-4"><ReportsTab /></TabsContent>
      </Tabs>
    </div>
  )
}

export default GestaoPage
