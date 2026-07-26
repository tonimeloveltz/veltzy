/**
 * Mapeia payloads de diferentes providers para formato padrao de lead.
 *
 * Presets suportados:
 * - generic:          { phone, name, email, tags, observations }
 * - meta_lead_ads:    Payload achatado por middleware (Zapier/n8n/Make).
 *                     NAO suporta webhook nativo do Meta (leadgen_id).
 * - google_lead_form: { user_column_data: [{ column_id, string_value }] }
 * - rd_station:       { leads: [{ name, personal_phone, email }] }
 */

export type WebhookPreset = 'meta_lead_ads' | 'google_lead_form' | 'rd_station' | 'generic'

export interface MappedPayload {
  phone: string
  name: string | null
  email: string | null
  tags: string[]
  observations: string | null
  // Campanha estruturada (RF4): flui para o roteamento por origem e para as colunas de origem do deal.
  utmCampaign: string | null
  campaignId: string | null
  adId: string | null
  gclid: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawPayload = Record<string, any>

export function mapPayload(preset: WebhookPreset, raw: unknown): MappedPayload {
  const data = (raw && typeof raw === 'object' ? raw : {}) as RawPayload

  switch (preset) {
    case 'meta_lead_ads':
      return mapMetaLeadAds(data)
    case 'google_lead_form':
      return mapGoogleLeadForm(data)
    case 'rd_station':
      return mapRdStation(data)
    case 'generic':
    default:
      return mapGeneric(data)
  }
}

/**
 * Formato generico (default).
 * Espera: { phone, name?, email?, tags?, observations? }
 */
function mapGeneric(data: RawPayload): MappedPayload {
  // generic SO extrai campanha dos campos top-level; nao ha buildObservations aqui,
  // entao nao ha duplicacao a remover (observations le so o campo explicito).
  return {
    phone: str(data.phone ?? data.telefone ?? data.cel ?? data.celular ?? ''),
    name: str(data.name ?? data.nome ?? null),
    email: str(data.email ?? data.e_mail ?? null),
    tags: toStringArray(data.tags),
    observations: str(data.observations ?? data.observacoes ?? data.obs ?? null),
    utmCampaign: str(data.utm_campaign ?? null),
    campaignId: str(data.campaign_id ?? null),
    adId: str(data.ad_id ?? null),
    gclid: str(data.gclid ?? null),
  }
}

/**
 * Meta Lead Ads via middleware (Zapier, n8n, Make).
 * Payload ja achatado: { full_name, phone_number, email, ... }
 * NAO suporta payload nativo do Meta (leadgen_id + Graph API).
 */
function mapMetaLeadAds(data: RawPayload): MappedPayload {
  return {
    phone: str(data.phone_number ?? data.phone ?? data.telefone ?? ''),
    name: str(data.full_name ?? data.name ?? data.nome ?? null),
    email: str(data.email ?? null),
    tags: toStringArray(data.tags ?? ['meta-ads']),
    // strip dos campos de campanha do knownKeys pra nao duplicarem estruturado + texto.
    observations: buildObservations(data, ['full_name', 'phone_number', 'email', 'name', 'phone', 'tags',
      'campaign_id', 'adset_id', 'ad_id', 'form_id', 'utm_campaign', 'utm_source', 'utm_medium', 'gclid']),
    utmCampaign: str(data.utm_campaign ?? null),
    campaignId: str(data.campaign_id ?? null),
    adId: str(data.ad_id ?? null),
    gclid: null,
  }
}

/**
 * Google Lead Form Extensions.
 * Espera: { user_column_data: [{ column_id: 'FULL_NAME', string_value: '...' }] }
 * Fallback: campos diretos { phone, name, email }
 */
function mapGoogleLeadForm(data: RawPayload): MappedPayload {
  const columns: Array<{ column_id: string; string_value: string }> = data.user_column_data
  const hasColumns = Array.isArray(columns)
  const get = (id: string) => hasColumns ? (columns.find((c) => c.column_id === id)?.string_value ?? null) : null

  // Campanha: Google traz gclid/campaign_id no top-level ou nas colunas (CAMPAIGN_ID/GCLID). Sem ad_id.
  const campaign = {
    utmCampaign: str(data.utm_campaign ?? null),
    campaignId: str(data.campaign_id ?? get('CAMPAIGN_ID')),
    adId: null,
    gclid: str(data.gclid ?? get('GCLID')),
  }

  if (hasColumns) {
    return {
      phone: str(get('PHONE_NUMBER') ?? get('PHONE') ?? ''),
      name: str(get('FULL_NAME') ?? get('NAME') ?? null),
      email: str(get('EMAIL') ?? null),
      tags: ['google-ads'],
      observations: null,
      ...campaign,
    }
  }
  // Fallback: tentar formato achatado
  return {
    phone: str(data.phone ?? data.phone_number ?? ''),
    name: str(data.name ?? data.full_name ?? null),
    email: str(data.email ?? null),
    tags: ['google-ads'],
    observations: null,
    ...campaign,
  }
}

/**
 * RD Station.
 * Espera: { leads: [{ name, personal_phone, email, ... }] }
 * Fallback: campos diretos.
 */
function mapRdStation(data: RawPayload): MappedPayload {
  const lead = Array.isArray(data.leads) ? data.leads[0] : data
  return {
    phone: str(lead?.personal_phone ?? lead?.mobile_phone ?? lead?.phone ?? lead?.telefone ?? ''),
    name: str(lead?.name ?? lead?.nome ?? null),
    email: str(lead?.email ?? null),
    tags: toStringArray(lead?.tags ?? ['rd-station']),
    observations: str(lead?.notes ?? lead?.observations ?? null),
    // RD Station: fora do escopo de anuncio (sem campanha estruturada).
    utmCampaign: null,
    campaignId: null,
    adId: null,
    gclid: null,
  }
}

// --- Helpers ---

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim())
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

/**
 * Monta observations com campos extras do payload que nao foram mapeados,
 * para nao perder dados.
 */
function buildObservations(data: RawPayload, knownKeys: string[]): string | null {
  const extras = Object.entries(data)
    .filter(([k, v]) => !knownKeys.includes(k) && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
  return extras.length > 0 ? extras.join('\n') : null
}
