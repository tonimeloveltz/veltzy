import { supabase } from '@/lib/supabase'
import type { WhatsAppCategories } from '@/types/database'

const DEFAULT_CATEGORIES: WhatsAppCategories = { official: true, qr_code: true }

/**
 * Le a allowlist de categorias WhatsApp da empresa (read-only).
 * Defensivo: null ou chave ausente -> ON (coerente com o default do Hub).
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
  }
}
