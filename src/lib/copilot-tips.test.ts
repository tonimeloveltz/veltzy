import { describe, it, expect } from 'vitest'
import { buildCopilotTips } from './copilot-tips'
import { buildActiveDealInfo } from './active-deal-info'
import type { DealWithLead, LeadWithDetails, PipelineStage } from '@/types/database'

// --- Factories ---------------------------------------------------------------

const HOUR = 3600_000
const DAY = 24 * HOUR

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

const lead = (over: Partial<LeadWithDetails>): LeadWithDetails =>
  ({
    id: 'l1', company_id: 'c', pipeline_id: 'p1', name: 'N', phone: '1',
    email: null, instagram_id: null, linkedin_id: null, source_id: null,
    stage_id: 's1', status: 'new', temperature: 'warm', ai_score: 0,
    assigned_to: null, is_ai_active: false, is_queued: false,
    conversation_status: 'read', tags: [], deal_value: null, observations: null,
    avatar_url: null, ad_context: null, whatsapp_instance_name: null,
    company_name: null, transfer_summary: null, last_customer_message_at: null,
    sla_breached: false, first_response_at: null, instagram_handle: null,
    linkedin_url: null, created_at: ago(0), updated_at: ago(0),
    ...over,
  } as LeadWithDetails)

const stage = (over: Partial<PipelineStage>): PipelineStage =>
  ({
    id: 's1', company_id: 'c', pipeline_id: 'p1', name: 'Stage', slug: 'stage',
    position: 0, color: '#000', is_final: false, is_positive: null,
    created_at: ago(0), updated_at: ago(0),
    ...over,
  } as PipelineStage)

const deal = (over: Partial<DealWithLead>): DealWithLead =>
  ({
    id: 'd', company_id: 'c', lead_id: 'l1', name: 'N', value: 0,
    stage_id: 's1', pipeline_id: 'p1', assigned_to: null, status: 'open',
    closed_at: null, created_at: ago(0), updated_at: ago(0),
    ...over,
  } as DealWithLead)

/** Deal aberto que marca o lead como ativo e mapeia seu stage. */
const openDeal = (leadId: string, stageId: string) =>
  deal({ id: `deal-${leadId}`, lead_id: leadId, status: 'open', stage_id: stageId })

const tipByKey = (tips: ReturnType<typeof buildCopilotTips>, key: string) =>
  tips.find((t) => t.key === key)

// --- Regra 1: new-no-contact -------------------------------------------------

describe('buildCopilotTips — Regra 1 (new-no-contact)', () => {
  it('DISPARA: lead ativo, created_at hoje, conversation_status unread', () => {
    const leads = [lead({ id: 'l1', created_at: ago(0), conversation_status: 'unread' })]
    const info = buildActiveDealInfo([openDeal('l1', 's1')])
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'new-no-contact')?.count).toBe(1)
  })

  it('NAO dispara: created_at de ontem (dia civil anterior)', () => {
    const leads = [lead({ id: 'l1', created_at: ago(DAY + HOUR), conversation_status: 'unread' })]
    const info = buildActiveDealInfo([openDeal('l1', 's1')])
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'new-no-contact')).toBeUndefined()
  })

  it('NAO dispara: created_at hoje mas conversation_status nao e unread', () => {
    const leads = [lead({ id: 'l1', created_at: ago(0), conversation_status: 'read' })]
    const info = buildActiveDealInfo([openDeal('l1', 's1')])
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'new-no-contact')).toBeUndefined()
  })

  it('NAO dispara: lead NAO ativo (sem deal aberto), mesmo hoje + unread', () => {
    const leads = [lead({ id: 'l1', created_at: ago(0), conversation_status: 'unread' })]
    const info = buildActiveDealInfo([]) // nenhum deal aberto
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'new-no-contact')).toBeUndefined()
  })
})

// --- Regra 2: proposal-stale -------------------------------------------------

describe('buildCopilotTips — Regra 2 (proposal-stale)', () => {
  const proposalStage = stage({ id: 'prop', slug: 'proposta' })

  it('DISPARA: lead ativo no proposalStage, updated_at ha 8 dias', () => {
    const leads = [lead({ id: 'l1', updated_at: ago(8 * DAY) })]
    const info = buildActiveDealInfo([openDeal('l1', 'prop')])
    const tips = buildCopilotTips(leads, [proposalStage], info)
    expect(tipByKey(tips, 'proposal-stale')?.count).toBe(1)
  })

  it('NAO dispara: logo ABAIXO do limite (6 dias e 23h)', () => {
    const leads = [lead({ id: 'l1', updated_at: ago(6 * DAY + 23 * HOUR) })]
    const info = buildActiveDealInfo([openDeal('l1', 'prop')])
    const tips = buildCopilotTips(leads, [proposalStage], info)
    expect(tipByKey(tips, 'proposal-stale')).toBeUndefined()
  })

  it('DISPARA: logo ACIMA do limite (7 dias e 1h)', () => {
    const leads = [lead({ id: 'l1', updated_at: ago(7 * DAY + HOUR) })]
    const info = buildActiveDealInfo([openDeal('l1', 'prop')])
    const tips = buildCopilotTips(leads, [proposalStage], info)
    expect(tipByKey(tips, 'proposal-stale')?.count).toBe(1)
  })

  it('NAO dispara: lead ativo em stage diferente do proposalStage', () => {
    const leads = [lead({ id: 'l1', updated_at: ago(10 * DAY) })]
    const info = buildActiveDealInfo([openDeal('l1', 'outro')])
    const tips = buildCopilotTips(leads, [proposalStage], info)
    expect(tipByKey(tips, 'proposal-stale')).toBeUndefined()
  })

  it('NAO dispara: pipeline sem stage de proposta (nem proposta nem proposal)', () => {
    const leads = [lead({ id: 'l1', updated_at: ago(10 * DAY) })]
    const info = buildActiveDealInfo([openDeal('l1', 'x')])
    const tips = buildCopilotTips(leads, [stage({ id: 'x', slug: 'lead' })], info)
    expect(tipByKey(tips, 'proposal-stale')).toBeUndefined()
  })

  it('DISPARA: stage resolvido pelo slug em ingles (proposal)', () => {
    const proposalEn = stage({ id: 'prop-en', slug: 'proposal' })
    const leads = [lead({ id: 'l1', updated_at: ago(8 * DAY) })]
    const info = buildActiveDealInfo([openDeal('l1', 'prop-en')])
    const tips = buildCopilotTips(leads, [proposalEn], info)
    expect(tipByKey(tips, 'proposal-stale')?.count).toBe(1)
  })
})

// --- Regra 3: hot-no-contact -------------------------------------------------

describe('buildCopilotTips — Regra 3 (hot-no-contact)', () => {
  it('DISPARA: lead ativo, temperature hot, updated_at ha 25h', () => {
    const leads = [lead({ id: 'l1', temperature: 'hot', updated_at: ago(25 * HOUR) })]
    const info = buildActiveDealInfo([openDeal('l1', 's1')])
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'hot-no-contact')?.count).toBe(1)
  })

  it('DISPARA: temperature fire, updated_at ha 25h', () => {
    const leads = [lead({ id: 'l1', temperature: 'fire', updated_at: ago(25 * HOUR) })]
    const info = buildActiveDealInfo([openDeal('l1', 's1')])
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'hot-no-contact')?.count).toBe(1)
  })

  it('NAO dispara: logo ABAIXO do limite (23h59m)', () => {
    const leads = [lead({ id: 'l1', temperature: 'hot', updated_at: ago(24 * HOUR - 60_000) })]
    const info = buildActiveDealInfo([openDeal('l1', 's1')])
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'hot-no-contact')).toBeUndefined()
  })

  it('NAO dispara: temperature warm (nao fire/hot), mesmo ha 25h', () => {
    const leads = [lead({ id: 'l1', temperature: 'warm', updated_at: ago(25 * HOUR) })]
    const info = buildActiveDealInfo([openDeal('l1', 's1')])
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'hot-no-contact')).toBeUndefined()
  })
})

// --- Regra 4: negotiation-stuck ----------------------------------------------

describe('buildCopilotTips — Regra 4 (negotiation-stuck)', () => {
  const negStage = stage({ id: 'neg', slug: 'negociacao' })

  it('DISPARA: lead ativo no negotiationStage, updated_at ha 4 dias', () => {
    const leads = [lead({ id: 'l1', updated_at: ago(4 * DAY) })]
    const info = buildActiveDealInfo([openDeal('l1', 'neg')])
    const tips = buildCopilotTips(leads, [negStage], info)
    expect(tipByKey(tips, 'negotiation-stuck')?.count).toBe(1)
  })

  it('NAO dispara: logo ABAIXO do limite (2 dias e 23h)', () => {
    const leads = [lead({ id: 'l1', updated_at: ago(2 * DAY + 23 * HOUR) })]
    const info = buildActiveDealInfo([openDeal('l1', 'neg')])
    const tips = buildCopilotTips(leads, [negStage], info)
    expect(tipByKey(tips, 'negotiation-stuck')).toBeUndefined()
  })

  it('DISPARA: logo ACIMA do limite (3 dias e 1h)', () => {
    const leads = [lead({ id: 'l1', updated_at: ago(3 * DAY + HOUR) })]
    const info = buildActiveDealInfo([openDeal('l1', 'neg')])
    const tips = buildCopilotTips(leads, [negStage], info)
    expect(tipByKey(tips, 'negotiation-stuck')?.count).toBe(1)
  })

  it('NAO dispara: pipeline sem stage de negociacao (nem negociacao nem negotiation)', () => {
    const leads = [lead({ id: 'l1', updated_at: ago(10 * DAY) })]
    const info = buildActiveDealInfo([openDeal('l1', 'x')])
    const tips = buildCopilotTips(leads, [stage({ id: 'x', slug: 'lead' })], info)
    expect(tipByKey(tips, 'negotiation-stuck')).toBeUndefined()
  })

  it('DISPARA: stage resolvido pelo slug em ingles (negotiation)', () => {
    const negEn = stage({ id: 'neg-en', slug: 'negotiation' })
    const leads = [lead({ id: 'l1', updated_at: ago(4 * DAY) })]
    const info = buildActiveDealInfo([openDeal('l1', 'neg-en')])
    const tips = buildCopilotTips(leads, [negEn], info)
    expect(tipByKey(tips, 'negotiation-stuck')?.count).toBe(1)
  })
})

// --- Regra 5: waiting-internal -----------------------------------------------

describe('buildCopilotTips — Regra 5 (waiting-internal)', () => {
  it('DISPARA: lead ativo, conversation_status waiting_internal (sem dependencia de tempo)', () => {
    const leads = [lead({ id: 'l1', conversation_status: 'waiting_internal', updated_at: ago(0) })]
    const info = buildActiveDealInfo([openDeal('l1', 's1')])
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'waiting-internal')?.count).toBe(1)
  })

  it('NAO dispara: lead ativo com outro conversation_status', () => {
    const leads = [lead({ id: 'l1', conversation_status: 'read' })]
    const info = buildActiveDealInfo([openDeal('l1', 's1')])
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'waiting-internal')).toBeUndefined()
  })

  it('NAO dispara: lead waiting_internal mas NAO ativo (sem deal aberto)', () => {
    const leads = [lead({ id: 'l1', conversation_status: 'waiting_internal' })]
    const info = buildActiveDealInfo([])
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'waiting-internal')).toBeUndefined()
  })
})

// --- Lista vazia -------------------------------------------------------------

describe('buildCopilotTips — lista vazia', () => {
  it('leads vazio => retorna []', () => {
    const tips = buildCopilotTips([], [], buildActiveDealInfo([]))
    expect(tips).toEqual([])
  })

  it('nenhuma regra satisfeita (todos count 0) => retorna [] (nada com count 0 vaza)', () => {
    const leads = [lead({ id: 'l1', temperature: 'cold', conversation_status: 'read', created_at: ago(10 * DAY), updated_at: ago(0) })]
    const info = buildActiveDealInfo([openDeal('l1', 's1')])
    const tips = buildCopilotTips(leads, [], info)
    expect(tips).toEqual([])
  })
})

// --- Contagem agregada -------------------------------------------------------

describe('buildCopilotTips — contagem agregada', () => {
  it('multiplos leads na MESMA regra => count reflete o total (3 unread hoje => 3)', () => {
    const leads = [
      lead({ id: 'l1', created_at: ago(0), conversation_status: 'unread' }),
      lead({ id: 'l2', created_at: ago(0), conversation_status: 'unread' }),
      lead({ id: 'l3', created_at: ago(0), conversation_status: 'unread' }),
    ]
    const info = buildActiveDealInfo([openDeal('l1', 's1'), openDeal('l2', 's1'), openDeal('l3', 's1')])
    const tips = buildCopilotTips(leads, [], info)
    expect(tipByKey(tips, 'new-no-contact')?.count).toBe(3)
  })
})

// --- Ordenacao por prioridade ------------------------------------------------

describe('buildCopilotTips — ordenacao por prioridade', () => {
  const proposalStage = stage({ id: 'prop', slug: 'proposta' })
  const negStage = stage({ id: 'neg', slug: 'negociacao' })

  it('as 5 regras disparando => ordem alta, alta, media, media, baixa', () => {
    const leads = [
      // Regra 1 (media): novo hoje + unread
      lead({ id: 'l1', created_at: ago(0), conversation_status: 'unread', updated_at: ago(0) }),
      // Regra 2 (media): proposta parada
      lead({ id: 'l2', updated_at: ago(8 * DAY) }),
      // Regra 3 (alta): hot ha 25h
      lead({ id: 'l3', temperature: 'hot', updated_at: ago(25 * HOUR) }),
      // Regra 4 (alta): negociacao parada
      lead({ id: 'l4', updated_at: ago(4 * DAY) }),
      // Regra 5 (baixa): waiting_internal
      lead({ id: 'l5', conversation_status: 'waiting_internal', updated_at: ago(0) }),
    ]
    const info = buildActiveDealInfo([
      openDeal('l1', 's1'),
      openDeal('l2', 'prop'),
      openDeal('l3', 's1'),
      openDeal('l4', 'neg'),
      openDeal('l5', 's1'),
    ])
    const tips = buildCopilotTips(leads, [proposalStage, negStage], info)
    expect(tips.map((t) => t.key)).toEqual([
      'hot-no-contact',
      'negotiation-stuck',
      'new-no-contact',
      'proposal-stale',
      'waiting-internal',
    ])
  })

  it('empate: apenas as duas regras alta (3 e 4) => preserva ordem natural (3 antes de 4)', () => {
    const leads = [
      lead({ id: 'l3', temperature: 'hot', updated_at: ago(25 * HOUR) }),
      lead({ id: 'l4', updated_at: ago(4 * DAY) }),
    ]
    const info = buildActiveDealInfo([openDeal('l3', 's1'), openDeal('l4', 'neg')])
    const tips = buildCopilotTips(leads, [negStage], info)
    expect(tips.map((t) => t.key)).toEqual(['hot-no-contact', 'negotiation-stuck'])
  })
})

// --- navigateTo --------------------------------------------------------------

describe('buildCopilotTips — navigateTo das regras de stage', () => {
  it('regra 2 com stage existente aponta para o stage=<id> correto', () => {
    const proposalStage = stage({ id: 'prop-123', slug: 'proposta' })
    const leads = [lead({ id: 'l1', updated_at: ago(8 * DAY) })]
    const info = buildActiveDealInfo([openDeal('l1', 'prop-123')])
    const tips = buildCopilotTips(leads, [proposalStage], info)
    expect(tipByKey(tips, 'proposal-stale')?.navigateTo).toBe('/pipeline?stage=prop-123&stale=7')
  })

  it('regra 4 com stage existente aponta para o stage=<id> correto', () => {
    const negStage = stage({ id: 'neg-456', slug: 'negociacao' })
    const leads = [lead({ id: 'l1', updated_at: ago(4 * DAY) })]
    const info = buildActiveDealInfo([openDeal('l1', 'neg-456')])
    const tips = buildCopilotTips(leads, [negStage], info)
    expect(tipByKey(tips, 'negotiation-stuck')?.navigateTo).toBe('/pipeline?stage=neg-456&stale=3')
  })
})
