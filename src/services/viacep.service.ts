// ViaCEP (publico, sem chave). So o CEP sai do navegador.

export interface ViaCepAddress {
  street: string
  district: string
  city: string
  state: string
}

interface ViaCepResponse {
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
  erro?: boolean | string
}

/** Devolve null para CEP inexistente; erro de rede sobe para quem chamou decidir. */
export const fetchViaCep = async (cep: string, signal?: AbortSignal): Promise<ViaCepAddress | null> => {
  const digits = cep.replace(/\D/g, '')
  if (digits.length !== 8) return null
  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal })
  if (!res.ok) return null
  const body = (await res.json()) as ViaCepResponse
  if (body.erro) return null
  return {
    street: body.logradouro ?? '',
    district: body.bairro ?? '',
    city: body.localidade ?? '',
    state: body.uf ?? '',
  }
}
