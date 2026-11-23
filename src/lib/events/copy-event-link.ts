import { toast } from 'sonner'
import { eventPublicUrl } from '@/lib/events/event-list'

export const copyText = async (text: string, success = 'Copiado.'): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(success)
  } catch {
    toast.error('Não foi possível copiar.')
  }
}

export const copyEventLink = (slug: string): Promise<void> => copyText(eventPublicUrl(slug), 'Link copiado.')
