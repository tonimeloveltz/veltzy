import { describe, it, expect } from 'vitest'
import { autoMapColumns, LEAD_FIELD_LABELS } from './csv-parser'

describe('csv-parser', () => {
  describe('autoMapColumns', () => {
    it('Nome completo so vira name quando nao ha coluna Nome (em qualquer ordem)', () => {
      expect(autoMapColumns(['Nome completo', 'Nome', 'Sobrenome'])).toEqual({ 0: null, 1: 'name', 2: 'last_name' })
      expect(autoMapColumns(['Nome completo', 'Telefone'])).toEqual({ 0: 'name', 1: 'phone' })
    })

    it('mapeia coluna de sobrenome (pt e en)', () => {
      expect(autoMapColumns(['Nome', 'Sobrenome', 'Telefone'])).toEqual({ 0: 'name', 1: 'last_name', 2: 'phone' })
      expect(autoMapColumns(['First Name', 'Last Name', 'Phone'])).toEqual({ 0: 'name', 1: 'last_name', 2: 'phone' })
      expect(autoMapColumns(['name', 'last_name', 'surname'])[1]).toBe('last_name')
      expect(LEAD_FIELD_LABELS.last_name).toBe('Sobrenome')
    })

    it('mapeia headers em português corretamente', () => {
      const headers = ['Nome', 'Telefone', 'Email', 'Origem', 'Fase', 'Temperatura', 'Valor']
      const mapping = autoMapColumns(headers)

      expect(mapping[0]).toBe('name')
      expect(mapping[1]).toBe('phone')
      expect(mapping[2]).toBe('email')
      expect(mapping[3]).toBe('source_id')
      expect(mapping[4]).toBe('stage_id')
      expect(mapping[5]).toBe('temperature')
      expect(mapping[6]).toBe('deal_value')
    })

    it('mapeia headers em inglês corretamente', () => {
      const headers = ['Name', 'Phone Number', 'Email Address', 'Source', 'Stage']
      const mapping = autoMapColumns(headers)

      expect(mapping[0]).toBe('name')
      expect(mapping[1]).toBe('phone')
      expect(mapping[2]).toBe('email')
      expect(mapping[3]).toBe('source_id')
      expect(mapping[4]).toBe('stage_id')
    })

    it('ignora headers desconhecidos', () => {
      const headers = ['ID', 'Cadastro', 'Nome', 'Telefone']
      const mapping = autoMapColumns(headers)

      expect(mapping[0]).toBeNull()
      expect(mapping[1]).toBeNull()
      expect(mapping[2]).toBe('name')
      expect(mapping[3]).toBe('phone')
    })

    it('não mapeia o mesmo campo duas vezes', () => {
      const headers = ['Phone', 'Mobile', 'Telefone']
      const mapping = autoMapColumns(headers)

      expect(mapping[0]).toBe('phone')
      expect(mapping[1]).toBeNull() // segundo "phone" é ignorado
      expect(mapping[2]).toBeNull() // terceiro "phone" é ignorado
    })

    it('lida com headers vazios', () => {
      const mapping = autoMapColumns([])
      expect(Object.keys(mapping)).toHaveLength(0)
    })
  })

  describe('LEAD_FIELD_LABELS', () => {
    it('tem labels para todos os campos', () => {
      expect(LEAD_FIELD_LABELS.name).toBe('Nome')
      expect(LEAD_FIELD_LABELS.phone).toBe('Telefone')
      expect(LEAD_FIELD_LABELS.email).toBe('Email')
    })
  })
})
