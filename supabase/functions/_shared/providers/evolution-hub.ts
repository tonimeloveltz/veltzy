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
 * Provider Evolution que envia via Edge Function do Hub (Supabase Central).
 * Veltzy nunca chama Evolution API diretamente (D1 locked).
 */
export class EvolutionHubProvider implements WhatsAppProvider {
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
    payload: SendMessagePayload & { instanceName?: string; companyId?: string },
  ): Promise<SendMessageResult> {
    const instanceName = payload.instanceName
    if (!instanceName) {
      throw new Error('instance_name obrigatorio para Evolution provider')
    }

    const isMedia = payload.type !== 'text' && payload.mediaUrl

    await this.callHub('evolution-send-message', {
      instance_name: instanceName,
      company_id: payload.companyId ?? _config.company_id,
      to: payload.phone,
      message: isMedia
        ? { media: { type: payload.type, url: payload.mediaUrl, caption: payload.content } }
        : { text: payload.content },
    })

    return {}
  }

  async getStatus(_config: WhatsAppConfig): Promise<StatusResult> {
    return { connected: true }
  }

  async getQrCode(_config: WhatsAppConfig): Promise<QrCodeResult> {
    throw new Error('QR code gerenciado no Hub. Acesse o painel do Hub.')
  }

  async disconnect(_config: WhatsAppConfig): Promise<void> {
    throw new Error('Gerenciamento de instancias feito no Hub.')
  }

  async restart(_config: WhatsAppConfig): Promise<void> {
    throw new Error('Gerenciamento de instancias feito no Hub.')
  }

  async getProfilePicture(_config: WhatsAppConfig, _phone: string): Promise<string | null> {
    return null
  }

  async getChats(_config: WhatsAppConfig): Promise<ChatEntry[]> {
    return []
  }
}
