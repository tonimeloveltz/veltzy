import { useMutation } from '@tanstack/react-query'
import { fetchViaCep, type ViaCepAddress } from '@/services/viacep.service'

export type ViaCepLookup =
  | { status: 'found'; address: ViaCepAddress }
  | { status: 'not_found' }
  | { status: 'error' }

/**
 * CEP inexistente e erro de rede saem separados: so o primeiro autoriza apagar
 * o endereco. Erro de rede continua silencioso (SPEC aba 1).
 */
export const useViaCep = () =>
  useMutation({
    mutationFn: async (cep: string): Promise<ViaCepLookup> => {
      try {
        const address = await fetchViaCep(cep)
        return address ? { status: 'found', address } : { status: 'not_found' }
      } catch {
        return { status: 'error' }
      }
    },
  })
