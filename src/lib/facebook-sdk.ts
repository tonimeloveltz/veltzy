import { META_APP_ID, META_GRAPH_VERSION } from './meta-embedded-signup'

interface FbLoginResponse {
  authResponse: { code?: string } | null
  status: string
}

interface FbLoginOptions {
  config_id: string
  response_type: string
  override_default_response_type: boolean
  extras: { sessionInfoVersion: number }
}

interface FacebookSdk {
  init(params: {
    appId: string
    autoLogAppEvents?: boolean
    xfbml?: boolean
    version: string
  }): void
  login(callback: (response: FbLoginResponse) => void, options: FbLoginOptions): void
}

declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'
const SDK_SCRIPT_ID = 'facebook-jssdk'

let sdkPromise: Promise<FacebookSdk> | null = null

/** Carrega e inicializa o SDK uma unica vez (idempotente). */
export function loadFacebookSdk(): Promise<FacebookSdk> {
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    if (window.FB) {
      resolve(window.FB)
      return
    }
    const appId = META_APP_ID
    if (!appId) {
      reject(new Error('Identificador do app nao configurado. Fale com o suporte.'))
      return
    }

    window.fbAsyncInit = () => {
      window.FB!.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: META_GRAPH_VERSION,
      })
      resolve(window.FB!)
    }

    // Script ja presente mas FB ainda nao pronto: aguardar o fbAsyncInit acima.
    if (document.getElementById(SDK_SCRIPT_ID)) return

    const script = document.createElement('script')
    script.id = SDK_SCRIPT_ID
    script.src = SDK_SRC
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onerror = () => {
      sdkPromise = null
      reject(new Error('Falha ao carregar o conector. Verifique sua conexao.'))
    }
    document.body.appendChild(script)
  })

  return sdkPromise
}
