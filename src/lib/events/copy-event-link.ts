import { toast } from 'sonner'
import { eventPublicUrl } from '@/lib/events/event-list'

export const copyEventLink = async (slug: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(eventPublicUrl(slug))
    toast.success('Link copiado.')
  } catch {
    toast.error('Não foi possível copiar o link.')
  }
}
