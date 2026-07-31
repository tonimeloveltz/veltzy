import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock encadeavel do client veltzy(): cada metodo retorna a propria chain; os
// terminais (maybeSingle/single) e o await direto (then) resolvem `result`.
const { chain, setResult } = vi.hoisted(() => {
  let result: { data: unknown; error: unknown } = { data: null, error: null }
  const c: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'is', 'order', 'limit', 'insert', 'update']) {
    c[m] = vi.fn(() => c)
  }
  c.maybeSingle = vi.fn(() => Promise.resolve(result))
  c.single = vi.fn(() => Promise.resolve(result))
  c.then = (resolve: (v: unknown) => unknown) => resolve(result)
  return { chain: c, setResult: (r: { data: unknown; error: unknown }) => { result = r } }
})

vi.mock('@/lib/supabase', () => ({ veltzy: () => chain }))

import { getValidConsent, grantConsent, revokeConsent } from '@/services/lead-consents.service'

beforeEach(() => {
  setResult({ data: null, error: null })
  vi.clearAllMocks()
})

describe('getValidConsent', () => {
  it('retorna null quando nao ha consentimento valido', async () => {
    setResult({ data: null, error: null })
    const r = await getValidConsent('co1', 'lead1', 'marketing_whatsapp')
    expect(r).toBeNull()
  })

  it('retorna o consentimento quando existe', async () => {
    const row = { id: 'c1', lead_id: 'lead1', revogado_em: null }
    setResult({ data: row, error: null })
    const r = await getValidConsent('co1', 'lead1', 'marketing_whatsapp')
    expect(r).toEqual(row)
  })

  it('filtra por revogado_em IS NULL (via .is)', async () => {
    setResult({ data: null, error: null })
    await getValidConsent('co1', 'lead1', 'marketing_whatsapp')
    expect(chain.is).toHaveBeenCalledWith('revogado_em', null)
  })

  it('propaga erro', async () => {
    setResult({ data: null, error: { message: 'boom' } })
    await expect(getValidConsent('co1', 'lead1', 'marketing_whatsapp')).rejects.toBeTruthy()
  })
})

describe('grantConsent', () => {
  it('insere com company_id e canal default whatsapp', async () => {
    setResult({ data: { id: 'c1' }, error: null })
    await grantConsent('co1', {
      leadId: 'lead1', finalidade: 'marketing_whatsapp', termoVersao: 'v1', origem: 'manual',
    })
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: 'co1', lead_id: 'lead1', canal: 'whatsapp', finalidade: 'marketing_whatsapp' }),
    )
  })

  it('traduz 23505 (opt-in ativo ja existe) em mensagem amigavel', async () => {
    setResult({ data: null, error: { code: '23505', message: 'duplicate' } })
    await expect(
      grantConsent('co1', { leadId: 'lead1', finalidade: 'marketing_whatsapp', termoVersao: 'v1', origem: 'manual' }),
    ).rejects.toThrow(/opt-in ativo/i)
  })
})

describe('revokeConsent', () => {
  it('carimba revogado_em (nao deleta)', async () => {
    setResult({ data: null, error: null })
    await revokeConsent('co1', 'c1')
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ revogado_em: expect.any(String) }),
    )
  })
})
