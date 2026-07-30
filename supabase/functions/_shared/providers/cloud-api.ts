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
 * Provider WhatsApp Cloud API (oficial Meta) que envia via Edge Function do Hub
 * (cloud-api-send-message). Veltzy nunca tem o token nem chama a Graph API direto
 * (regra cardinal). So o phone_number_id cruza a fronteira.
 */
export class CloudApiHubProvider implements WhatsAppProvider {
  private hubUrl: string
  private hubServiceKey: string

  constructor() {
    // Hub = mesmo projeto Supabase. URL pode ter override; a service key e lida do
    // runtime (SUPABASE_SERVICE_ROLE_KEY) para casar exatamente com o guard m2m do
    // Hub (token === SUPABASE_SERVICE_ROLE_KEY). Nunca hardcodar nem usar key legada.
    this.hubUrl = Deno.env.get('HUB_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')!
    this.hubServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  }

  async sendMessage(
    _config: WhatsAppConfig,
    payload: SendMessagePayload & { phoneNumberId?: string; companyId?: string },
  ): Promise<SendMessageResult> {
    const phoneNumberId = payload.phoneNumberId
    if (!phoneNumberId) {
      throw new Error('phone_number_id obrigatorio para Cloud API provider')
    }

    const isMedia = payload.type !== 'text' && payload.mediaUrl
    // Template (HSM): manda os campos crus; o Hub monta o components Graph
    // (type:'template', components:[{type:'body', parameters:[{type:'text',text}]}]).
    const message = payload.template
      ? { template: { name: payload.template.name, language: payload.template.language, parameters: payload.template.parameters } }
      : isMedia
        ? { media: { type: payload.type, url: payload.mediaUrl, caption: payload.content } }
        : { text: payload.content }

    const body = {
      phone_number_id: phoneNumberId,
      company_id: payload.companyId ?? _config.company_id,
      to: payload.phone,
      message,
    }

    const res = await fetch(`${this.hubUrl}/functions/v1/cloud-api-send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.hubServiceKey,
        'Authorization': `Bearer ${this.hubServiceKey}`,
      },
      body: JSON.stringify(body),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      // Hub propaga error.{code,message,details,fbtrace_id}. Monta string combinada
      // para messages.delivery_error (code = tratamento futuro, fbtrace = suporte Meta).
      const e = (data?.error ?? {}) as Record<string, unknown>
      const parts = [
        e.code != null ? `[${e.code}]` : null,
        e.message ?? null,
        e.details ?? null,
        e.fbtrace_id ? `fbtrace=${e.fbtrace_id}` : null,
      ].filter(Boolean)
      throw new Error(parts.join(' | ') || `Cloud API send failed (${res.status})`)
    }

    return { externalId: (data as { wamid?: string }).wamid }
  }

  async getStatus(_config: WhatsAppConfig): Promise<StatusResult> {
    return { connected: true }
  }

  async getQrCode(_config: WhatsAppConfig): Promise<QrCodeResult> {
    throw new Error('Cloud API gerenciada no Hub / Embedded Signup.')
  }

  async disconnect(_config: WhatsAppConfig): Promise<void> {
    throw new Error('Gerenciamento de numeros feito no Hub.')
  }

  async restart(_config: WhatsAppConfig): Promise<void> {
    throw new Error('Gerenciamento de numeros feito no Hub.')
  }

  async getProfilePicture(_config: WhatsAppConfig, _phone: string): Promise<string | null> {
    return null
  }

  async getChats(_config: WhatsAppConfig): Promise<ChatEntry[]> {
    return []
  }
}
