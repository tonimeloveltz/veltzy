// Resolução do "número de saída" (instance_name) da boas-vindas por AUTOMAÇÃO
// (run-automations · send_whatsapp) para lead de webhook. Lógica PURA e testável.
//
// Contexto do gap: run-automations enfileira na message_queue SEM instance_name; o
// consumidor (process-message-queue) FALHA no ramo não-oficial (WAHA/Evolution) se o
// item não tem instance_name. Lead de webhook nasce sem whatsapp_instance_name e sem
// vendedor → não há número determinístico. Fix: a ORIGEM define o número de resposta
// em source_integration.config.send_instance; run-automations resolve e carimba.
//
// Providers OFICIAIS/legados resolvem o número por conta própria no consumidor:
//   - zapi: getWhatsAppConfig por company (não usa instance_name)
//   - cloud_api: resolveOutboundCloudApiNumber (número default da empresa)
// Só WAHA/Evolution (por sessão/instância) exigem o instance_name no item.

export const NON_OFFICIAL_PROVIDERS = ['waha', 'evolution'] as const

const clean = (v: string | null | undefined): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

export function isNonOfficialProvider(provider: string | null | undefined): boolean {
  return (NON_OFFICIAL_PROVIDERS as readonly string[]).includes(provider ?? '')
}

export interface AutomationSendDecision {
  /** Número/sessão de saída resolvido (ou null se não resolveu). */
  instanceName: string | null
  /** true = NÃO enfileirar; envio inviável (não-oficial sem número). */
  blocked: boolean
  /** Motivo explícito quando blocked (vai pro automation_logs). */
  reason: string | null
}

export interface AutomationSendInput {
  provider: string | null | undefined
  /** lead.whatsapp_instance_name (prioridade 1: responde pelo número que recebeu). */
  leadInstanceName: string | null | undefined
  /** source_integration.config.send_instance da origem do lead (prioridade 2). */
  sourceSendInstance: string | null | undefined
}

/**
 * Decide o instance_name de saída e se o envio deve ser bloqueado.
 * Prioridade: lead.whatsapp_instance_name > origem (config.send_instance).
 * Bloqueia SÓ quando o provider é não-oficial (WAHA/Evolution) e não há número —
 * aí o item nunca enviaria (falharia opaco no consumidor); melhor falha explícita.
 * Para zapi/cloud_api: nunca bloqueia (eles resolvem o número no consumidor);
 * instanceName pode ir null (sem efeito no caminho deles).
 */
export function decideAutomationSend(input: AutomationSendInput): AutomationSendDecision {
  const instanceName = clean(input.leadInstanceName) ?? clean(input.sourceSendInstance)

  if (isNonOfficialProvider(input.provider) && !instanceName) {
    return {
      instanceName: null,
      blocked: true,
      reason:
        'send_whatsapp bloqueado: origem sem numero de resposta configurado ' +
        '(config.send_instance) para provider nao-oficial. Configure o "Numero de ' +
        'resposta" na aba Integracoes ou pareie um numero WAHA.',
    }
  }

  return { instanceName, blocked: false, reason: null }
}
