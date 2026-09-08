import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeInitializer } from '@/components/layout/theme-initializer'
import { useAuthInit } from '@/hooks/use-auth-init'
import { ProtectedRoute } from '@/components/auth/protected-route'
import { MainLayout } from '@/components/layout/main-layout'
import { PageLoadingSkeleton } from '@/components/shared/page-loading-skeleton'
import { ErrorBoundary } from '@/components/shared/error-boundary'

const AuthPage = lazy(() => import('@/pages/auth'))
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const UpdatePasswordPage = lazy(() => import('@/pages/update-password'))
const PipelinePage = lazy(() => import('@/pages/pipeline'))
const InboxPage = lazy(() => import('@/pages/inbox'))
const AdminPage = lazy(() => import('@/pages/admin'))
const SuperAdminPage = lazy(() => import('@/pages/super-admin'))
const GestaoPage = lazy(() => import('@/pages/gestao'))
const TarefasPage = lazy(() => import('@/pages/tarefas'))
const DealsPage = lazy(() => import('@/pages/deals'))
const ContatosPage = lazy(() => import('@/pages/contatos'))
const MinhaContaPage = lazy(() => import('@/pages/minha-conta'))
const AceitarConvitePage = lazy(() => import('@/pages/aceitar-convite'))
const AcessoNegadoPage = lazy(() => import('@/pages/acesso-negado'))
const SdrIaPage = lazy(() => import('@/pages/sdr-ia'))
const PrivacidadePage = lazy(() => import('@/pages/privacidade'))
const TermosPage = lazy(() => import('@/pages/termos'))
const NotFoundPage = lazy(() => import('@/pages/not-found'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      // Desligado: voltar para a aba nao deve refazer query nenhuma. As duas
      // superficies que precisam de dado vivo (mensagens do inbox e deals do
      // kanban) tem realtime do Supabase, e as demais revalidam ao navegar,
      // porque refetchOnMount segue ligado.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const AuthInitializer = () => {
  useAuthInit()
  return null
}

const App = () => {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AuthInitializer />
          <ThemeInitializer />
          <Toaster />
          <Suspense fallback={<PageLoadingSkeleton />}>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/aceitar-convite" element={<AceitarConvitePage />} />
              <Route path="/acesso-negado" element={<AcessoNegadoPage />} />

              {/* Paginas publicas institucionais (legais) - FORA do auth guard */}
              <Route path="/privacidade" element={<PrivacidadePage />} />
              <Route path="/privacy" element={<PrivacidadePage />} />
              <Route path="/termos" element={<TermosPage />} />
              <Route path="/terms" element={<TermosPage />} />


              <Route
                path="/update-password"
                element={
                  <ProtectedRoute skipCompanyCheck>
                    <UpdatePasswordPage />
                  </ProtectedRoute>
                }
              />

              <Route
                element={
                  <ProtectedRoute>
                    <MainLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/pipeline" element={<PipelinePage />} />
                <Route path="/inbox" element={<InboxPage />} />
                <Route path="/inbox/:leadId" element={<InboxPage />} />
                <Route path="/tarefas" element={<TarefasPage />} />
                <Route path="/deals" element={<DealsPage />} />
                <Route path="/contatos" element={<ContatosPage />} />
                <Route path="/gestao" element={<ProtectedRoute requireRole={['manager', 'admin', 'super_admin']}><GestaoPage /></ProtectedRoute>} />
                {/* Aliases legados mantidos de proposito: preservam links salvos/bookmarks antigos. Nao remover. */}
                <Route path="/sellers" element={<Navigate to="/gestao?tab=vendedores" replace />} />
                <Route path="/settings" element={<Navigate to="/minha-conta" replace />} />
                <Route path="/minha-conta" element={<MinhaContaPage />} />
                <Route path="/sdr-ia" element={<ProtectedRoute requireRole={['admin', 'manager', 'super_admin']} requireFeature="sdr_agent_v2"><SdrIaPage /></ProtectedRoute>} />
                <Route path="/admin" element={<ProtectedRoute requireRole={['admin', 'super_admin']}><AdminPage /></ProtectedRoute>} />
                {/* Alias legado mantido de proposito (ver bloco de aliases acima): protege links antigos para /company. */}
                <Route path="/company" element={<Navigate to="/admin?tab=empresa" replace />} />
                <Route path="/super-admin" element={<ProtectedRoute requireRole={['super_admin']}><SuperAdminPage /></ProtectedRoute>} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
