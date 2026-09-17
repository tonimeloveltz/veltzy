import { describe, it, expect } from 'vitest'
import {
  spDateKey,
  daysBetweenSpDates,
  buildCadenceTimeline,
  lastContactLabel,
  hasContactToday,
} from './contact-cadence'
import type { LeadContactEvent } from '@/types/database'

/**
 * Nenhum teste depende do relogio nem do fuso da maquina que roda a suite: todo
 * "agora" entra por parametro e o modulo formata em America/Sao_Paulo explicito.
 * Mesmo padrao de current-month.test.ts.
 */
const ev = (id: string, contactedAt: string): LeadContactEvent => ({
  id,
  company_id: 'company-1',
  lead_id: 'lead-1',
  registered_by: 'profile-1',
  contacted_at: contactedAt,
  created_at: contactedAt,
})

describe('spDateKey (dia de calendario em SP)', () => {
  it('1. ISO UTC no meio do dia devolve a data de SP', () => {
    expect(spDateKey('2026-10-05T15:00:00Z')).toBe('2026-10-05')
  })

  it('2. virada de dia: 02:00Z ainda e 23h do dia anterior em SP', () => {
    // 2026-10-06T02:00:00Z == 2026-10-05 23:00 em SP (UTC-3). E o caso que
    // quebra qualquer implementacao baseada em toISOString().slice(0, 10).
    expect(spDateKey('2026-10-06T02:00:00Z')).toBe('2026-10-05')
    expect(new Date('2026-10-06T02:00:00Z').toISOString().slice(0, 10)).toBe('2026-10-06')
  })

  it('3. virada no outro sentido: 03:30Z ja e 00h30 do mesmo dia em SP', () => {
    expect(spDateKey('2026-10-05T03:30:00Z')).toBe('2026-10-05')
  })

  it('4. aceita Date e string ISO com o mesmo resultado', () => {
    const iso = '2026-10-05T15:00:00Z'
    expect(spDateKey(new Date(iso))).toBe(spDateKey(iso))
    expect(spDateKey(new Date(iso))).toBe('2026-10-05')
  })
})

describe('daysBetweenSpDates (diferenca em dias de calendario)', () => {
  it('5. mesmo dia -> 0', () => {
    expect(daysBetweenSpDates('2026-10-05', '2026-10-05')).toBe(0)
  })

  it('6. dias consecutivos -> 1', () => {
    expect(daysBetweenSpDates('2026-10-05', '2026-10-06')).toBe(1)
  })

  it('7. atravessando mes -> 2', () => {
    expect(daysBetweenSpDates('2026-09-30', '2026-10-02')).toBe(2)
  })

  it('8. atravessando ano -> 1', () => {
    expect(daysBetweenSpDates('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('9. ordem invertida -> negativo', () => {
    expect(daysBetweenSpDates('2026-10-06', '2026-10-05')).toBe(-1)
    expect(daysBetweenSpDates('2026-10-02', '2026-09-30')).toBe(-2)
  })

  it('10. janela de horario de verao devolve inteiro exato', () => {
    // 15/10/2017 foi a entrada do horario de verao no Brasil: aquele dia teve
    // 23h em horario local. 18/02/2018 foi a saida: 25h. Subtrair dois Date
    // construidos em local erraria aqui; em UTC a conta e exata.
    expect(daysBetweenSpDates('2017-10-14', '2017-10-15')).toBe(1)
    expect(daysBetweenSpDates('2018-02-17', '2018-02-18')).toBe(1)
    expect(daysBetweenSpDates('2017-10-14', '2017-10-21')).toBe(7)
  })
})

describe('buildCadenceTimeline (linha do tempo e selo D+N)', () => {
  it('11. lista vazia -> []', () => {
    expect(buildCadenceTimeline([])).toEqual([])
  })

  it('12. um evento -> dPlus 0', () => {
    const timeline = buildCadenceTimeline([ev('a', '2026-10-01T13:00:00Z')])

    expect(timeline).toHaveLength(1)
    expect(timeline[0].dPlus).toBe(0)
    expect(timeline[0].dayKey).toBe('2026-10-01')
    expect(timeline[0].id).toBe('a')
  })

  it('13. tres eventos -> decrescente, com D+4, D+1 e D+0', () => {
    const timeline = buildCadenceTimeline([
      ev('a', '2026-10-01T13:00:00Z'),
      ev('b', '2026-10-02T13:00:00Z'),
      ev('c', '2026-10-05T13:00:00Z'),
    ])

    expect(timeline.map((e) => [e.id, e.dPlus])).toEqual([
      ['c', 4],
      ['b', 1],
      ['a', 0],
    ])
  })

  it('14. dois contatos no mesmo dia -> MESMO dPlus, os dois na lista', () => {
    // Primeiro contato em 01/10; dois contatos em 03/10 (09h e 18h de SP).
    const timeline = buildCadenceTimeline([
      ev('a', '2026-10-01T13:00:00Z'),
      ev('b', '2026-10-03T12:00:00Z'),
      ev('c', '2026-10-03T21:00:00Z'),
    ])

    expect(timeline).toHaveLength(3)
    const mesmoDia = timeline.filter((e) => e.dayKey === '2026-10-03')
    expect(mesmoDia).toHaveLength(2)
    expect(mesmoDia.every((e) => e.dPlus === 2)).toBe(true)
  })

  it('15. entrada fora de ordem produz o mesmo resultado do caso 13', () => {
    const embaralhado = buildCadenceTimeline([
      ev('c', '2026-10-05T13:00:00Z'),
      ev('a', '2026-10-01T13:00:00Z'),
      ev('b', '2026-10-02T13:00:00Z'),
    ])

    expect(embaralhado.map((e) => [e.id, e.dPlus])).toEqual([
      ['c', 4],
      ['b', 1],
      ['a', 0],
    ])
  })

  it('16. dois contatos no mesmo dia sendo os primeiros -> ambos D+0', () => {
    const timeline = buildCadenceTimeline([
      ev('a', '2026-10-01T12:00:00Z'),
      ev('b', '2026-10-01T21:00:00Z'),
    ])

    expect(timeline.every((e) => e.dPlus === 0)).toBe(true)
  })

  it('17. remover o PRIMEIRO evento renumera todos os demais', () => {
    const todos = [
      ev('a', '2026-10-01T13:00:00Z'),
      ev('b', '2026-10-02T13:00:00Z'),
      ev('c', '2026-10-05T13:00:00Z'),
    ]
    expect(buildCadenceTimeline(todos).map((e) => e.dPlus)).toEqual([4, 1, 0])

    // Apagou o contato de 01/10: 02/10 vira o novo D+0.
    const semPrimeiro = buildCadenceTimeline(todos.filter((e) => e.id !== 'a'))

    expect(semPrimeiro.map((e) => [e.id, e.dPlus])).toEqual([
      ['c', 3],
      ['b', 0],
    ])
  })

  it('18. virada de dia dentro da serie -> D+N e D+N+1', () => {
    // 23h50 de 05/10 e 00h10 de 06/10 em SP: 20 minutos de distancia, dias
    // de calendario diferentes.
    const timeline = buildCadenceTimeline([
      ev('a', '2026-10-01T13:00:00Z'),
      ev('b', '2026-10-06T02:50:00Z'),
      ev('c', '2026-10-06T03:10:00Z'),
    ])

    const b = timeline.find((e) => e.id === 'b')!
    const c = timeline.find((e) => e.id === 'c')!

    expect(b.dayKey).toBe('2026-10-05')
    expect(c.dayKey).toBe('2026-10-06')
    expect(b.dPlus).toBe(4)
    expect(c.dPlus).toBe(5)
  })
})

describe('lastContactLabel (resumo do ultimo contato)', () => {
  const now = new Date('2026-10-05T15:00:00Z') // 12h de 05/10 em SP

  it('19. vazio -> null', () => {
    expect(lastContactLabel([], now)).toBeNull()
  })

  it('20. ultimo contato hoje', () => {
    expect(lastContactLabel([ev('a', '2026-10-05T11:00:00Z')], now)).toBe('Último contato hoje')
  })

  it('21. ultimo contato ontem', () => {
    expect(lastContactLabel([ev('a', '2026-10-04T11:00:00Z')], now)).toBe('Último contato ontem')
  })

  it('22. ultimo contato ha 3 dias', () => {
    expect(lastContactLabel([ev('a', '2026-10-02T11:00:00Z')], now)).toBe('Último contato há 3 dias')
  })

  it('23. usa o ULTIMO evento mesmo com a lista em ordem crescente', () => {
    const crescente = [
      ev('a', '2026-10-01T13:00:00Z'),
      ev('b', '2026-10-02T13:00:00Z'),
      ev('c', '2026-10-04T13:00:00Z'),
    ]

    expect(lastContactLabel(crescente, now)).toBe('Último contato ontem')
  })

  it('24. contacted_at no futuro clampa em "hoje", nunca dias negativos', () => {
    const futuro = lastContactLabel([ev('a', '2026-10-09T13:00:00Z')], now)

    expect(futuro).toBe('Último contato hoje')
    expect(futuro).not.toContain('-')
  })
})

describe('hasContactToday (existe contato no dia de hoje em SP)', () => {
  const now = new Date('2026-10-05T15:00:00Z') // 12h de 05/10 em SP

  it('25. evento hoje as 00h05 de SP -> true', () => {
    expect(hasContactToday([ev('a', '2026-10-05T03:05:00Z')], now)).toBe(true)
  })

  it('26. evento ontem as 23h55 de SP -> false, apesar dos 10 minutos', () => {
    // Espelho do caso 25: a diferenca entre "dia de calendario" e "24 horas".
    expect(hasContactToday([ev('a', '2026-10-05T02:55:00Z')], now)).toBe(false)
  })

  it('27. lista vazia -> false', () => {
    expect(hasContactToday([], now)).toBe(false)
  })

  it('28. varios eventos, so um deles hoje -> true', () => {
    const eventos = [
      ev('a', '2026-09-28T13:00:00Z'),
      ev('b', '2026-10-01T13:00:00Z'),
      ev('c', '2026-10-05T11:00:00Z'),
    ]

    expect(hasContactToday(eventos, now)).toBe(true)
  })
})
