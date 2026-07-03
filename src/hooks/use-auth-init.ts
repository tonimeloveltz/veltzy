import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'

// Guard module-level: a inicializacao de auth roda UMA vez no ciclo de vida do
// app, idempotente contra a dupla montagem do StrictMode (dev) e HMR. Sem isso,
// o segundo mount redispararia getSession() e concorreria no refresh do token
// (race -> 400). A assinatura de onAuthStateChange e um singleton que vive o
// app inteiro: nao ha unsubscribe no cleanup (evita o buraco StrictMode
// mount->unmount->mount deixar o app sem assinatura ativa).
let authInitStarted = false

const startAuthInit = () => {
  if (authInitStarted) return
  authInitStarted = true

  const { setUser, loadUserData, clear, setIsLoading } = useAuthStore.getState()
  let initialized = false
  let loadedUserId: string | null = null

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      loadedUserId = session.user.id
      setUser(session.user)
      loadUserData(session.user.id)
    } else {
      setIsLoading(false)
    }
    initialized = true
  })

  supabase.auth.onAuthStateChange((event, session) => {
    if (!initialized) return
    if (event === 'INITIAL_SESSION') return

    // Sem sessao (logout): limpa o estado.
    if (event === 'SIGNED_OUT' || !session?.user) {
      loadedUserId = null
      clear()
      return
    }

    // Sessao renovada, user atualizado ou re-emissao de SIGNED_IN para o mesmo
    // usuario ja carregado: apenas sincroniza o user, sem recarregar tudo
    // (evita flash de spinner e enxurrada de queries no uso normal do app).
    if (
      event === 'TOKEN_REFRESHED' ||
      event === 'USER_UPDATED' ||
      loadedUserId === session.user.id
    ) {
      setUser(session.user)
      return
    }

    // Login novo: carrega os dados completos. loadUserData re-arma o isLoading
    // (guard segura em spinner) e deduplica por user (nao dispara em paralelo).
    loadedUserId = session.user.id
    setUser(session.user)
    loadUserData(session.user.id)
  })
}

export const useAuthInit = () => {
  useEffect(() => {
    startAuthInit()
  }, [])
}
