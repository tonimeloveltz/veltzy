import { describe, expect, it } from 'vitest'
import Papa from 'papaparse'
import { registrationsToCsv } from './csv-export'
import type { RegistrationRow } from './registration-view'

const base: RegistrationRow = {
  id: 'r1', lead_id: 'l', deal_id: 'd', status: 'attended', first_name: 'Ána', last_name: 'Souza', email: 'a@x.com',
  whatsapp: '5511917162109', answers: [], ref_code: null, utm_source: 'ig', utm_medium: null, utm_campaign: null,
  utm_content: null, utm_term: null, consent_marketing: true, source: 'public_form', confirmed_at: null,
  checked_in_at: '2026-11-24T11:52:00Z', canceled_at: null, created_at: '2026-11-20T13:00:00Z',
}

describe('registrationsToCsv', () => {
  it('BOM, ponto e virgula, acento e WhatsApp formatado', () => {
    const csv = registrationsToCsv([base], { timeZone: 'America/Sao_Paulo', fieldOrder: [] })
    expect(csv.startsWith('﻿Nome;Sobrenome;E-mail;WhatsApp')).toBe(true)
    const [, line] = csv.slice(1).split('\r\n')
    const cells = line.split(';')
    expect(cells[0]).toBe('Ána')
    expect(cells[3]).toBe('(11) 91716-2109')
    expect(cells[4]).toBe('Presente')
    expect(cells[5]).toBe('24/11/2026, 08:52')
    expect(cells[7]).toBe('utm')
    expect(cells[14]).toBe('sim')
  })

  it('uma coluna por campo, pelo rotulo da epoca, na ordem do formulario', () => {
    const rows: RegistrationRow[] = [
      { ...base, answers: [{ field_id: 'b', label_snapshot: 'Cargo', type: 'text', value: 'CEO', display: 'CEO' }] },
      { ...base, id: 'r2', answers: [
        { field_id: 'a', label_snapshot: 'Empresa', type: 'text', value: 'X; Y', display: 'X; Y' },
        { field_id: 'z', label_snapshot: 'Campo antigo', type: 'text', value: 'v', display: 'v' },
      ] },
    ]
    const parsed = Papa.parse<string[]>(registrationsToCsv(rows, { timeZone: 'UTC', fieldOrder: ['a', 'b'] }).slice(1), { delimiter: ';' })
    const header = parsed.data[0]
    expect(header.slice(-3)).toEqual(['Empresa', 'Cargo', 'Campo antigo'])
    expect(parsed.data[1].slice(-3)).toEqual(['', 'CEO', ''])
    expect(parsed.data[2].slice(-3)).toEqual(['X; Y', '', 'v'])
  })
})
