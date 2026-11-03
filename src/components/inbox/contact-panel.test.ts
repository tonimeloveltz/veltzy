import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Test the debounce/flush logic in isolation (same pattern as ContactPanel)
describe('ContactPanel - observations auto-save logic', () => {
  let pendingObs: { leadId: string; text: string } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let savedCalls: Array<{ leadId: string; text: string }> = []

  const saveFn = async (leadId: string, text: string) => {
    savedCalls.push({ leadId, text })
  }

  const flush = async () => {
    if (timer) { clearTimeout(timer); timer = null }
    if (!pendingObs) return
    const p = pendingObs
    pendingObs = null
    await saveFn(p.leadId, p.text)
  }

  const schedule = (text: string, leadId: string) => {
    if (timer) clearTimeout(timer)
    pendingObs = { leadId, text }
    timer = setTimeout(() => flush(), 1000)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    pendingObs = null
    timer = null
    savedCalls = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounce salva apos 1s sem digitar', async () => {
    schedule('nota 1', 'lead-a')
    expect(savedCalls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(500)
    expect(savedCalls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(600)
    expect(savedCalls).toHaveLength(1)
    expect(savedCalls[0]).toEqual({ leadId: 'lead-a', text: 'nota 1' })
  })

  it('digitar repetidamente reinicia o timer', async () => {
    schedule('a', 'lead-a')
    await vi.advanceTimersByTimeAsync(800)
    schedule('ab', 'lead-a')
    await vi.advanceTimersByTimeAsync(800)
    schedule('abc', 'lead-a')
    await vi.advanceTimersByTimeAsync(1100)

    expect(savedCalls).toHaveLength(1)
    expect(savedCalls[0].text).toBe('abc')
  })

  it('flush imediato salva o que esta pendente', async () => {
    schedule('pendente', 'lead-b')
    await flush()

    expect(savedCalls).toHaveLength(1)
    expect(savedCalls[0]).toEqual({ leadId: 'lead-b', text: 'pendente' })
  })

  it('flush sem pendencia e noop', async () => {
    await flush()
    expect(savedCalls).toHaveLength(0)
  })

  it('flush usa leadId do momento da digitacao (race condition)', async () => {
    schedule('obs do lead A', 'lead-a')
    // Simula trocar de lead: flush com leadId capturado
    await flush()

    expect(savedCalls).toHaveLength(1)
    expect(savedCalls[0].leadId).toBe('lead-a') // NAO lead-b

    // Agora novo lead
    schedule('obs do lead B', 'lead-b')
    await vi.advanceTimersByTimeAsync(1100)

    expect(savedCalls).toHaveLength(2)
    expect(savedCalls[1].leadId).toBe('lead-b')
  })

  it('flush duplo nao salva duas vezes', async () => {
    schedule('texto', 'lead-c')
    await flush()
    await flush() // segundo flush sem nova digitacao

    expect(savedCalls).toHaveLength(1)
  })
})

describe('ContactPanel - payload do save (so campos tocados)', async () => {
  const { buildContactPanelPayload } = await import('@/lib/contact-panel-payload')
  type Field = import('@/lib/contact-panel-payload').ContactPanelField

  // Lead como vem da RPC get_conversation_list: sem company_name,
  // instagram_handle, linkedin_url, first_name, last_name. O estado do painel
  // nasce vazio nesses campos.
  const fromRpc = {
    firstName: '', lastName: '', email: 'maria@x.com', companyName: '',
    instagramHandle: '', linkedinUrl: '', sourceId: 'src-1', assignedTo: 'u1', tags: ['vip'],
  }
  const touched = (...f: Field[]) => new Set<Field>(f)

  it('regressao: lead da RPC sem company_name, salvar outro campo nao manda company_name', () => {
    const payload = buildContactPanelPayload({ ...fromRpc, email: 'nova@x.com' }, touched('email'), false)
    expect(payload).toEqual({ email: 'nova@x.com' })
    expect('company_name' in payload).toBe(false)
    expect('instagram_handle' in payload).toBe(false)
    expect('linkedin_url' in payload).toBe(false)
    expect('first_name' in payload).toBe(false)
    expect('last_name' in payload).toBe(false)
  })

  it('nada tocado: payload vazio', () => {
    expect(buildContactPanelPayload(fromRpc, touched(), false)).toEqual({})
  })

  it('campo tocado e apagado vira null', () => {
    expect(buildContactPanelPayload({ ...fromRpc, companyName: '' }, touched('company_name'), false))
      .toEqual({ company_name: null })
  })

  it('nome: tocar so o sobrenome manda first e last, com trim, nunca name', () => {
    const payload = buildContactPanelPayload(
      { ...fromRpc, firstName: ' Maria ', lastName: ' Souza ' }, touched('last_name'), false,
    )
    expect(payload).toEqual({ first_name: 'Maria', last_name: 'Souza' })
    expect('name' in payload).toBe(false)
  })

  it('nome: sobrenome vazio vira null', () => {
    expect(buildContactPanelPayload({ ...fromRpc, firstName: 'Maria', lastName: '  ' }, touched('first_name'), false))
      .toEqual({ first_name: 'Maria', last_name: null })
  })

  it('nome: Nome obrigatorio vazio nao manda nada de nome, mas manda o resto', () => {
    expect(buildContactPanelPayload({ ...fromRpc, firstName: '' }, touched('first_name', 'tags'), true))
      .toEqual({ tags: ['vip'] })
  })
})
