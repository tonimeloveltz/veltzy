import type {
  WhatsAppProvider,
  WhatsAppConfig,
  SendMessagePayload,
  SendMessageResult,
  StatusResult,
  QrCodeResult,
  ChatEntry,
} from '../whatsapp-provider.ts'

/**
 * Provider WAHA que envia via Edge Function do Hub (Supabase Central).
 * Espelha EvolutionHubProvider: Veltzy nunca chama a WAHA diretamente — o Hub
 * e dono da infra (secret WAHA_API_KEY_GLOBAL + base_url so no Hub).
 * A gerencia de sessao (QR/connect/disconnect) vive no Hub (waha-instance-manage).
 */
export class WahaHubProvider implements WhatsAppProvider {
  private hubUrl: string
  private hubServiceKey: string

  constructor() {
    this.hubUrl = Deno.env.get('HUB_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')!
    this.hubServiceKey = Deno.env.get('HUB_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  }

  private async callHub(fnName: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.hubUrl}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.hubServiceKey,
        'Authorization': `Bearer ${this.hubServiceKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Hub ${fnName} failed (${res.status}): ${text}`)
    }

    return res.json()
  }

  async sendMessage(
    _config: WhatsAppConfig,
    payload: SendMessagePayload & { sessionName?: string; companyId?: string },
  ): Promise<SendMessageResult> {
    const sessionName = payload.sessionName
    if (!sessionName) {
      throw new Error('session_name obrigatorio para WAHA provider')
    }

    const isMedia = payload.type !== 'text' && payload.mediaUrl

    const result = await this.callHub('waha-send-message', {
      session_name: sessionName,
      company_id: payload.companyId ?? _config.company_id,
      to: payload.phone,
      message: isMedia
        ? { media: { type: payload.type, url: payload.mediaUrl, caption: payload.content } }
        : { text: payload.content },
    }) as { external_id?: string } | null

    return result?.external_id ? { externalId: result.external_id } : {}
  }

  async getStatus(_config: WhatsAppConfig): Promise<StatusResult> {
    return { connected: true }
  }

  async getQrCode(_config: WhatsAppConfig): Promise<QrCodeResult> {
    throw new Error('QR code gerenciado no Hub. Acesse o painel do Hub.')
  }

  async disconnect(_config: WhatsAppConfig): Promise<void> {
    throw new Error('Gerenciamento de sessoes feito no Hub.')
  }

  async restart(_config: WhatsAppConfig): Promise<void> {
    throw new Error('Gerenciamento de sessoes feito no Hub.')
  }

  async getProfilePicture(_config: WhatsAppConfig, _phone: string): Promise<string | null> {
    return null
  }

  async getChats(_config: WhatsAppConfig): Promise<ChatEntry[]> {
    return []
  }
}
