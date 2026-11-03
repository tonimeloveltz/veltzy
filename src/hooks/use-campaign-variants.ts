import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CampaignVariantsError, generateCampaignVariants } from '@/services/campaigns.service'

const ERROR_MESSAGES: Record<string, string> = {
  ai_not_enabled: 'A geração com IA não está ativa para a sua empresa.',
  mkt_ativo_disabled: 'Campanhas não estão ativas para a sua empresa.',
  forbidden: 'Você não tem permissão para gerar versões da campanha.',
  limit_exceeded: 'O limite de uso de IA da empresa foi atingido.',
}

/** Gera versões da mensagem livre com IA (edge campaign-variants). */
export const useGenerateVariants = () =>
  useMutation({
    mutationFn: ({ message, count, avoid }: { message: string; count: number; avoid?: string[] }) =>
      generateCampaignVariants(message, count, avoid),
    onSuccess: (res) => {
      if (res.incomplete) toast.warning('A IA não conseguiu gerar todas as versões. Use "Gerar outra" para completar.')
    },
    onError: (err: Error) => {
      const reason = err instanceof CampaignVariantsError ? err.reason : 'unknown'
      toast.error(ERROR_MESSAGES[reason] ?? 'Não foi possível gerar as versões agora. Tente de novo.')
    },
  })
