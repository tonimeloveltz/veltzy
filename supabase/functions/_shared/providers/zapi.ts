import type { WhatsAppProvider, WhatsAppConfig, SendMessagePayload, SendMessageResult, StatusResult, QrCodeResult, ChatEntry } from '../whatsapp-provider.ts'

export class ZApiProvider implements WhatsAppProvider {
  private buildUrl(config: WhatsAppConfig): string {
    const m = config.metadata
    const serverUrl = (m.server_url as string) ?? 'https://api.z-api.io'
    const instanceId = m.instance_id as string
    const token = m.token as string
    return `${serverUrl}/instances/${instanceId}/token/${token}`
  }

  private buildHeaders(config: WhatsAppConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Client-Token': (config.metadata.client_token as string) ?? '',
    }
  }

  async sendMessage(config: WhatsAppConfig, payload: SendMessagePayload): Promise<SendMessageResult> {
    const baseUrl = this.buildUrl(config)
    const headers = this.buildHeaders(config)

    const endpoints: Record<string, string> = {
      text: '/send-text',
      image: '/send-image',
      audio: '/send-audio',
      video: '/send-video',
      document: '/send-document',
    }

    const body: Record<string, unknown> = { phone: payload.phone }
    if (payload.type === 'text') {
      body.message = payload.content
    } else {
      body.caption = payload.content
      if (payload.type === 'image') body.image = payload.mediaUrl
      if (payload.type === 'audio') body.audio = payload.mediaUrl
      if (payload.type === 'video') body.video = payload.mediaUrl
      if (payload.type === 'document') {
        body.document = payload.mediaUrl
        body.fileName = payload.fileName
      }
    }

    const res = await fetch(`${baseUrl}${endpoints[payload.type] ?? '/send-text'}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok || data.error) {
      throw new Error(`Z-API error: ${data.error ?? res.status}`)
    }
    return {}
  }

  async getStatus(config: WhatsAppConfig): Promise<StatusResult> {
    const res = await fetch(`${this.buildUrl(config)}/status`, {
      headers: { 'Client-Token': (config.metadata.client_token as string) ?? '' },
    })
    const data = await res.json()
    return {
      connected: data.connected === true,
      phoneNumber: data.phoneNumber ?? undefined,
    }
  }

  async getQrCode(config: WhatsAppConfig): Promise<QrCodeResult> {
    const res = await fetch(`${this.buildUrl(config)}/qr-code`, {
      headers: { 'Client-Token': (config.metadata.client_token as string) ?? '' },
    })
    const data = await res.json()
    return { qrCode: data.value }
  }

  async disconnect(config: WhatsAppConfig): Promise<void> {
    await fetch(`${this.buildUrl(config)}/disconnect`, {
      method: 'POST',
      headers: { 'Client-Token': (config.metadata.client_token as string) ?? '' },
    })
  }

  async restart(config: WhatsAppConfig): Promise<void> {
    await fetch(`${this.buildUrl(config)}/restart`, {
      method: 'POST',
      headers: { 'Client-Token': (config.metadata.client_token as string) ?? '' },
    })
  }

  async getProfilePicture(config: WhatsAppConfig, phone: string): Promise<string | null> {
    const res = await fetch(
      `${this.buildUrl(config)}/profile-picture?phone=${phone}`,
      { headers: { 'Client-Token': (config.metadata.client_token as string) ?? '' } },
    )
    const data = await res.json()
    return data?.link ?? data?.value ?? null
  }

  async getChats(config: WhatsAppConfig): Promise<ChatEntry[]> {
    const res = await fetch(`${this.buildUrl(config)}/chats`, {
      headers: { 'Client-Token': (config.metadata.client_token as string) ?? '' },
    })
    const data = await res.json() as Array<{ phone: string; name?: string; isGroup: boolean }>
    return data.map((c) => ({
      phone: c.phone,
      name: c.name,
      isGroup: c.isGroup,
    }))
  }
}
