// Composicao da DM de primeiro contato (helper). SEM caller no V3: quem usa e o
// V4 (auto, compoe antes de chamar prospect-dm-send) e a UI no V5 (rascunho pro
// admin). Passa pelo gateway do Hub (ai-complete, feature snake 'prospect_dm_message'
// -> cai no modelo configurado; sem config, Haiku). A chave de IA nunca sai do Hub.

import { HubClient } from './hub-client.ts'

export const OPT_OUT_SENTENCE = 'Se nao quiser receber mais mensagens, responda SAIR.'

export interface ComposeDmInput {
  companyId: string
  /** trecho do grupo que gerou o sinal (contexto do pedido). */
  snippet: string
  category?: string | null
  groupName?: string | null
}

/** Compoe UMA mensagem curta de primeiro contato, SEMPRE com a frase de opt-out. */
export async function composeProspectDm(input: ComposeDmInput): Promise<string> {
  const hub = new HubClient()
  const system =
    'Voce escreve UMA mensagem curta de primeiro contato no WhatsApp em nome da Veltz, uma consultoria. ' +
    'A pessoa demonstrou interesse num grupo. Tom cordial e direto, sem jargao, no maximo 2-3 frases. ' +
    'Nao prometa resultados. Encerre SEMPRE com esta frase exata, em linha propria: "' + OPT_OUT_SENTENCE + '"'
  const user =
    `Pedido observado${input.groupName ? ` no grupo "${input.groupName}"` : ''}` +
    `${input.category ? ` (categoria: ${input.category})` : ''}: "${input.snippet}"`

  const resp = await hub.complete({
    company_id: input.companyId,
    product: 'veltzy',
    feature: 'prospect_dm_message',
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0.7,
    max_tokens: 300,
  })

  let text = (resp.data?.content ?? '').trim()
  // Garantia LGPD: se o modelo nao incluiu o opt-out, anexa (o gate do dm-send tambem exige).
  if (!/\b(sair|pare)\b/i.test(text)) {
    text = `${text}\n\n${OPT_OUT_SENTENCE}`.trim()
  }
  return text
}
