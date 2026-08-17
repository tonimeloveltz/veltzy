import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { MobileTopbar } from '@/components/layout/mobile-topbar'
import { ErrorReportButton } from '@/components/shared/error-report-button'
import { usePresenceHeartbeat } from '@/hooks/use-presence-heartbeat'

const MainLayout = () => {
  usePresenceHeartbeat()
  // Estado efemero e so do shell: nao justifica store Zustand.
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      {/* min-w-0 aqui e no <main>: impede conteudo largo (kanban, tabelas) de
          esticar o flex item e gerar scroll horizontal no body. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="min-w-0 flex-1 overflow-y-auto scrollbar-minimal">
          <Outlet />
        </main>
      </div>
      <ErrorReportButton />
    </div>
  )
}

export { MainLayout }
