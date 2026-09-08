import { supabase } from '@/lib/supabase'
import type { WhatsAppCategories } from '@/types/database'

// official/qr_code default ON (compat com tenants atuais); waha default OFF
// (rollout gradual — so aparece quando o Hub liga a chave).
const DEFAULT_CATEGORIES: WhatsAppCategories = { official: true, qr_code: true, waha: false }

/**
 * Le a allowlist de categorias WhatsApp da empresa (read-only).
 * Defensivo: chave ausente -> default (official/qr_code ON, waha OFF).
 * O Veltzy NUNCA escreve esta coluna.
 */
export const getWhatsAppCategories = async (companyId: string): Promise<WhatsAppCategories> => {
  const { data, error } = await supabase
    .from('companies')
    .select('whatsapp_categories')
    .eq('id', companyId)
    .single()
  if (error) throw error

  const raw = (data?.whatsapp_categories ?? null) as Partial<WhatsAppCategories> | null
  return {
    official: raw?.official ?? DEFAULT_CATEGORIES.official,
    qr_code: raw?.qr_code ?? DEFAULT_CATEGORIES.qr_code,
    waha: raw?.waha ?? DEFAULT_CATEGORIES.waha,
  }
}
