export type WhatsAppCategoryKey = 'official' | 'qr_code'

export interface WhatsAppCategoryMeta {
  key: WhatsAppCategoryKey
  label: string
  description: string
  /** false = placeholder "em configuracao" (Onda 2 liga o fluxo real). */
  available: boolean
}

// Labels neutros de produto. NUNCA citar provider real aqui.
export const WHATSAPP_CATEGORIES: Record<WhatsAppCategoryKey, WhatsAppCategoryMeta> = {
  official: {
    key: 'official',
    label: 'WhatsApp API Oficial',
    description: 'Conexao oficial para o numero da sua empresa.',
    available: false, // Onda 1: placeholder. Onda 2 liga o Embedded Signup.
  },
  qr_code: {
    key: 'qr_code',
    label: 'Conexao via QR Code',
    description: 'Conecte um numero escaneando um QR Code.',
    available: true,
  },
}

export const WHATSAPP_CATEGORY_ORDER: WhatsAppCategoryKey[] = ['official', 'qr_code']
