import { assertEquals } from 'jsr:@std/assert@1'
import { pickByWeight, RoutingRule, WEIGHT } from './resolve-pipeline-by-origin.ts'

// Helper: monta regra com defaults (ativa).
function rule(partial: Partial<RoutingRule> & Pick<RoutingRule, 'match_type' | 'match_value' | 'pipeline_id'>): RoutingRule {
  return { id: `rule-${partial.pipeline_id}-${partial.match_type}`, is_active: true, ...partial }
}

Deno.test('pickByWeight: mais especifico vence: ad_id > campaign_id > utm_campaign > instance > webhook_source', () => {
  const rules: RoutingRule[] = [
    rule({ match_type: 'webhook_source', match_value: 'src-1', pipeline_id: 'p-webhook' }),
    rule({ match_type: 'instance', match_value: 'inst-1', pipeline_id: 'p-instance' }),
    rule({ match_type: 'utm_campaign', match_value: 'utm-1', pipeline_id: 'p-utm' }),
    rule({ match_type: 'campaign_id', match_value: 'camp-1', pipeline_id: 'p-campaign' }),
    rule({ match_type: 'ad_id', match_value: 'ad-1', pipeline_id: 'p-ad' }),
  ]
  const ids = {
    adId: 'ad-1',
    campaignId: 'camp-1',
    utmCampaign: 'utm-1',
    instanceName: 'inst-1',
    sourceId: 'src-1',
  }
  assertEquals(pickByWeight(rules, ids)?.pipeline_id, 'p-ad')
})

Deno.test('pickByWeight: sem ad_id, campaign_id vence utm/instance', () => {
  const rules: RoutingRule[] = [
    rule({ match_type: 'instance', match_value: 'inst-1', pipeline_id: 'p-instance' }),
    rule({ match_type: 'utm_campaign', match_value: 'utm-1', pipeline_id: 'p-utm' }),
    rule({ match_type: 'campaign_id', match_value: 'camp-1', pipeline_id: 'p-campaign' }),
  ]
  const ids = { campaignId: 'camp-1', utmCampaign: 'utm-1', instanceName: 'inst-1' }
  assertEquals(pickByWeight(rules, ids)?.pipeline_id, 'p-campaign')
})

Deno.test('pickByWeight: nenhuma regra casa -> null (cai no fallback default)', () => {
  const rules: RoutingRule[] = [
    rule({ match_type: 'instance', match_value: 'inst-OUTRA', pipeline_id: 'p-instance' }),
  ]
  const ids = { instanceName: 'inst-1' }
  assertEquals(pickByWeight(rules, ids), null)
})

Deno.test('pickByWeight: empresa sem regras -> null', () => {
  assertEquals(pickByWeight([], { adId: 'ad-1', instanceName: 'inst-1' }), null)
})

Deno.test('pickByWeight: sem identificadores (nada no inbound) -> null', () => {
  const rules: RoutingRule[] = [
    rule({ match_type: 'instance', match_value: 'inst-1', pipeline_id: 'p-instance' }),
  ]
  assertEquals(pickByWeight(rules, {}), null)
})

Deno.test('pickByWeight: regra inativa e ignorada mesmo casando o valor', () => {
  const rules: RoutingRule[] = [
    rule({ match_type: 'instance', match_value: 'inst-1', pipeline_id: 'p-ativa' }),
    rule({ match_type: 'ad_id', match_value: 'ad-1', pipeline_id: 'p-inativa', is_active: false }),
  ]
  // ad_id casaria e teria peso maior, mas esta inativa -> vence a instancia ativa
  assertEquals(pickByWeight(rules, { adId: 'ad-1', instanceName: 'inst-1' })?.pipeline_id, 'p-ativa')
})

Deno.test('pickByWeight: caso Joao: instancia casa regra A, ad_id casa regra B -> vence B (ad_id)', () => {
  // Mesmo contato/instancia de sempre, mas entrou por um anuncio: o deal vai pro funil do evento.
  const rules: RoutingRule[] = [
    rule({ match_type: 'instance', match_value: 'veltz-group-01', pipeline_id: 'funil-principal' }),
    rule({ match_type: 'ad_id', match_value: 'ad-evento-2026', pipeline_id: 'funil-evento' }),
  ]
  // 1o negocio: sem campanha, so a instancia -> funil principal
  assertEquals(
    pickByWeight(rules, { instanceName: 'veltz-group-01' })?.pipeline_id,
    'funil-principal',
  )
  // 2o negocio: mesma instancia + ad_id do evento -> funil do evento (mais especifico)
  assertEquals(
    pickByWeight(rules, { instanceName: 'veltz-group-01', adId: 'ad-evento-2026' })?.pipeline_id,
    'funil-evento',
  )
})

Deno.test('pickByWeight: match_value com virgula/parenteses (UTM) casa por igualdade exata, sem quebrar', () => {
  const utm = 'promo,verao (2026)'
  const rules: RoutingRule[] = [
    rule({ match_type: 'utm_campaign', match_value: utm, pipeline_id: 'p-utm' }),
  ]
  assertEquals(pickByWeight(rules, { utmCampaign: utm })?.pipeline_id, 'p-utm')
  // valor diferente nao casa
  assertEquals(pickByWeight(rules, { utmCampaign: 'promo,verao' }), null)
})

Deno.test('WEIGHT: ordem de especificidade esperada', () => {
  assertEquals(WEIGHT.ad_id > WEIGHT.campaign_id, true)
  assertEquals(WEIGHT.campaign_id > WEIGHT.utm_campaign, true)
  assertEquals(WEIGHT.utm_campaign > WEIGHT.instance, true)
  assertEquals(WEIGHT.instance > WEIGHT.webhook_source, true)
})
