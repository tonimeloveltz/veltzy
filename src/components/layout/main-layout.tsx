import { Link, Outlet } from 'react-router-dom'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { ErrorReportButton } from '@/components/shared/error-report-button'
import { usePresenceHeartbeat } from '@/hooks/use-presence-heartbeat'

const MainLayout = () => {
  usePresenceHeartbeat()

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex flex-1 flex-col overflow-y-auto scrollbar-minimal">
        <div className="flex-1">
          <Outlet />
        </div>
        <footer className="flex justify-end gap-4 px-6 py-3">
          <Link
            to="/privacidade"
            className="text-xs text-muted-foreground/70 hover:text-muted-foreground"
          >
            Política de Privacidade
          </Link>
          <Link
            to="/termos"
            className="text-xs text-muted-foreground/70 hover:text-muted-foreground"
          >
            Termos de Serviço
          </Link>
        </footer>
      </main>
      <ErrorReportButton />
    </div>
  )
}

export { MainLayout }
