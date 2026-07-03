import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'

export const useAuthInit = () => {
  const initialized = useRef(false)
  const loadedUserId = useRef<string | null>(null)
  const { setUser, loadUserData, clear, setIsLoading } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadedUserId.current = session.user.id
        setUser(session.user)
        loadUserData(session.user.id)
      } else {
        setIsLoading(false)
      }
      initialized.current = true
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!initialized.current) return
        if (event === 'INITIAL_SESSION') return

        // Sem sessao (logout): limpa o estado.
        if (event === 'SIGNED_OUT' || !session?.user) {
          loadedUserId.current = null
          clear()
          return
        }

        // Sessao renovada, user atualizado ou re-emissao de SIGNED_IN para o
        // mesmo usuario ja carregado: apenas sincroniza o user, sem recarregar
        // tudo (evita flash de spinner durante o uso normal do app).
        if (
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED' ||
          loadedUserId.current === session.user.id
        ) {
          setUser(session.user)
          return
        }

        // Login novo: carrega os dados completos. loadUserData re-arma o
        // isLoading, entao o guard segura em spinner ate a sessao propagar.
        loadedUserId.current = session.user.id
        setUser(session.user)
        loadUserData(session.user.id)
      }
    )

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
