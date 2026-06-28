import type { WhatsAppProvider, WhatsAppProviderType } from './whatsapp-provider.ts'
import { ZApiProvider } from './providers/zapi.ts'
import { EvolutionHubProvider } from './providers/evolution-hub.ts'
import { CloudApiHubProvider } from './providers/cloud-api.ts'

const providers: Record<string, WhatsAppProvider> = {
  zapi: new ZApiProvider(),
  evolution: new EvolutionHubProvider(),
  cloud_api: new CloudApiHubProvider(),
}

export function createProvider(provider: WhatsAppProviderType): WhatsAppProvider {
  const impl = providers[provider]
  if (!impl) throw new Error(`WhatsApp provider nao suportado: ${provider}`)
  return impl
}
