import { useMutation } from '@tanstack/react-query'
import { fetchViaCep } from '@/services/viacep.service'

/** Erro de rede ou CEP inexistente devolvem null: o preenchimento e silencioso (SPEC aba 1). */
export const useViaCep = () =>
  useMutation({
    mutationFn: async (cep: string) => {
      try {
        return await fetchViaCep(cep)
      } catch {
        return null
      }
    },
  })
