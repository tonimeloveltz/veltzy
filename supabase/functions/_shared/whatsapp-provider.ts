// --- Tipos ---

export type WhatsAppProviderType = 'zapi' | 'evolution' | 'cloud_api' | 'waha'

export interface WhatsAppConfig {
  id: string
  company_id: string
  provider: WhatsAppProviderType
  status: string
  phone_number: string | null
  qr_code: string | null
  connected_at: string | null
  metadata: Record<string, unknown>
}

export interface SendMessagePayload {
  phone: string
  content: string
  type: 'text' | 'image' | 'audio' | 'video' | 'document'
  mediaUrl?: string
  fileName?: string
  // Metadados de roteamento opcionais, resolvidos por whatsapp-send e lidos pelo
  // provider correspondente. Ignorados pelos providers que nao os usam.
  instanceName?: string   // Evolution: instancia do Hub
  sessionName?: string    // WAHA: sessao do Hub
  phoneNumberId?: string  // Cloud API: numero Meta resolvido
  companyId?: string      // Evolution/Cloud API/WAHA: tenant (m2m com o Hub)
}

export interface SendMessageResult {
  /** id do provider para a mensagem enviada (wamid no Cloud API). undefined nos providers que nao retornam. */
  externalId?: string
}

export interface StatusResult {
  connected: boolean
  phoneNumber?: string
}

export interface QrCodeResult {
  qrCode: string
}

export interface ChatEntry {
  phone: string
  name?: string
  isGroup: boolean
}

// --- Interface ---

export interface WhatsAppProvider {
  sendMessage(config: WhatsAppConfig, payload: SendMessagePayload): Promise<SendMessageResult>
  getStatus(config: WhatsAppConfig): Promise<StatusResult>
  getQrCode(config: WhatsAppConfig): Promise<QrCodeResult>
  disconnect(config: WhatsAppConfig): Promise<void>
  restart(config: WhatsAppConfig): Promise<void>
  getProfilePicture(config: WhatsAppConfig, phone: string): Promise<string | null>
  getChats(config: WhatsAppConfig): Promise<ChatEntry[]>
}
