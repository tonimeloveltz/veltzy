import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { edgeFunctionErrorCode } from '@/lib/edge-function-error'
import { instagramOAuthErrorMessage } from '@/lib/instagram-messages'
import { completeInstagramOAuth } from '@/services/instagram.service'
import { INSTAGRAM_CONNECTION_QUERY_KEY } from '@/hooks/use-instagram-connection'

export interface InstagramOAuthCallbackState {
  status: 'loading' | 'success' | 'error'
  message: string
}

const LOADING: InstagramOAuthCallbackState = { status: 'loading', message: 'Conectando o Instagram...' }

/**
 * Le code/state/error da URL de retorno do instagram.com e conclui a conexao.
 * O code e de uso unico: o ref garante uma chamada so, inclusive no StrictMode.
 */
export const useInstagramOAuthCallback = (): InstagramOAuthCallbackState => {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const started = useRef(false)

  const code = searchParams.get('code')
  const oauthState = searchParams.get('state')
  const error = searchParams.get('error')
  const errorReason = searchParams.get('error_reason')

  const [state, setState] = useState<InstagramOAuthCallbackState>(() => {
    if (error) {
      const canceled = error === 'access_denied' || errorReason === 'user_denied'
      return { status: 'error', message: instagramOAuthErrorMessage(canceled ? 'access_denied' : null) }
    }
    if (!code || !oauthState) return { status: 'error', message: instagramOAuthErrorMessage(null) }
    return LOADING
  })

  useEffect(() => {
    if (started.current || error || !code || !oauthState) return
    started.current = true

    completeInstagramOAuth(code, oauthState)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: [INSTAGRAM_CONNECTION_QUERY_KEY] })
        setState({ status: 'success', message: 'Instagram conectado.' })
      })
      .catch((err: unknown) => {
        setState({ status: 'error', message: instagramOAuthErrorMessage(edgeFunctionErrorCode(err)) })
      })
  }, [code, oauthState, error, queryClient])

  return state
}
