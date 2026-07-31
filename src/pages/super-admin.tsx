import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CompaniesDashboard } from '@/components/super-admin/companies-dashboard'
import { SupportTicketsDashboard } from '@/components/super-admin/support-tickets-dashboard'

const SuperAdminPage = () => {
  return (
    <div className="space-y-6 animate-fade-in p-4 sm:p-6">
      <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-4 py-2">
        <p className="text-sm font-medium text-yellow-500">Painel Daxen Labs - Ambiente de producao</p>
      </div>

      <h1 className="text-2xl font-bold">Super Admin</h1>

      <Tabs defaultValue="companies">
        <TabsList>
          <TabsTrigger value="companies">Empresas</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
        </TabsList>
        <TabsContent value="companies" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Empresas</CardTitle></CardHeader>
            <CardContent><CompaniesDashboard /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tickets" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Tickets de Suporte</CardTitle></CardHeader>
            <CardContent><SupportTicketsDashboard /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default SuperAdminPage
