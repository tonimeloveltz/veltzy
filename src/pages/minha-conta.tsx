import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProfileSettings } from '@/components/settings/profile-settings'
import { ScriptsManager } from '@/components/settings/scripts-manager'
import { NotificationPreferencesPanel } from '@/components/settings/notification-preferences'
import { PersonalReports } from '@/components/settings/personal-reports'

const MinhaContaPage = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'profile'

  return (
    <div className="space-y-6 animate-fade-in p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Minha Conta</h1>

      <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
          <TabsTrigger value="notifications">Notificacoes</TabsTrigger>
          <TabsTrigger value="reports">Meus Relatorios</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          <ProfileSettings />
        </TabsContent>
        <TabsContent value="scripts" className="mt-4">
          <ScriptsManager />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationPreferencesPanel />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <PersonalReports />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default MinhaContaPage
