import { loadFacebookSdk } from './facebook-sdk'

// Valores publicos do app (vao para o client-side). Sem segredo aqui.
export const META_APP_ID = import.meta.env.VITE_META_APP_ID as string | undefined
export const META_ES_CONFIG_ID = import.meta.env.VITE_META_ES_CONFIG_ID as string | undefined
export const META_GRAPH_VERSION = 'v25.0' // casar com GRAPH_API_VERSION do Hub
export const META_SESSION_INFO_VERSION = 3

// Origem confiavel das mensagens de sessao do popup.
const MESSAGE_ORIGIN = 'https://www.facebook.com'

/** Erro lancado quando o cliente fecha/cancela o popup. */
export const EMBEDDED_SIGNUP_CANCELLED = 'EMBEDDED_SIGNUP_CANCELLED'

export interface EmbeddedSignupResult {
  code: string
  phoneNumberId: string
  wabaId: string
}

interface SessionInfo {
  phoneNumberId: string
  wabaId: string
}

interface SignupMessage {
  type?: string
  event?: string
  data?: { phone_number_id?: string; waba_id?: string }
}

/**
 * Inicia o cadastro incorporado: carrega o SDK, registra o listener de sessao
 * ANTES do login e correlaciona o `code` (callback) com `phone_number_id`/`waba_id`
 * (mensagem do popup). Resolve com os tres dados; rejeita em cancelamento/erro.
 */
export async function launchEmbeddedSignup(): Promise<EmbeddedSignupResult> {
  if (!META_ES_CONFIG_ID) {
    throw new Error('Configuracao de conexao ausente. Fale com o suporte.')
  }

  const fb = await loadFacebookSdk()

  return new Promise<EmbeddedSignupResult>((resolve, reject) => {
    let session: SessionInfo | null = null
    let aborted = false

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== MESSAGE_ORIGIN) return
      if (typeof event.data !== 'string') return

      let parsed: SignupMessage
      try {
        parsed = JSON.parse(event.data) as SignupMessage
      } catch {
        return // mensagem que nao e nossa
      }

      if (parsed.type !== 'WA_EMBEDDED_SIGNUP') return

      // 'FINISH' = fluxo padrao (migracao/novo numero).
      // 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' = coexistence (numero segue no
      // app WhatsApp Business). Ambos entregam code/phone_number_id/waba_id igual.
      if (parsed.event === 'FINISH' || parsed.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
        const d = parsed.data
        if (d?.phone_number_id && d?.waba_id) {
          session = { phoneNumberId: d.phone_number_id, wabaId: d.waba_id }
        }
      } else if (parsed.event === 'CANCEL' || parsed.event === 'ERROR') {
        aborted = true
      }
    }

    const cleanup = () => window.removeEventListener('message', onMessage)
    window.addEventListener('message', onMessage)

    fb.login(
      (response) => {
        const code = response.authResponse?.code
        cleanup()

        if (aborted || !code) {
          reject(new Error(EMBEDDED_SIGNUP_CANCELLED))
          return
        }
        if (!session) {
          reject(new Error('Nao foi possivel obter os dados do numero. Tente novamente.'))
          return
        }
        resolve({ code, phoneNumberId: session.phoneNumberId, wabaId: session.wabaId })
      },
      {
        config_id: META_ES_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          sessionInfoVersion: META_SESSION_INFO_VERSION,
          featureType: 'whatsapp_business_app_onboarding',
        },
      },
    )
  })
}
