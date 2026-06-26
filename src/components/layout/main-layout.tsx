import { Outlet } from 'react-router-dom'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { ErrorReportButton } from '@/components/shared/error-report-button'
import { usePresenceHeartbeat } from '@/hooks/use-presence-heartbeat'

const MainLayout = () => {
  usePresenceHeartbeat()

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto scrollbar-minimal">
        <Outlet />
      </main>
      <ErrorReportButton />
    </div>
  )
}

export { MainLayout }
