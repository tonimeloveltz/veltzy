import { describe, it, expect } from 'vitest'
import { mapCsvRowToLead, validateRow } from './import-leads.service'
import type { PipelineStage, LeadSourceRecord } from '@/types/database'

const mockStages: PipelineStage[] = [
  { id: 'stage-1', company_id: 'c1', pipeline_id: 'p1', name: 'Novo', slug: 'novo', position: 0, color: '#000', is_final: false, is_positive: null, created_at: '', updated_at: '' },
  { id: 'stage-2', company_id: 'c1', pipeline_id: 'p1', name: 'Qualificando', slug: 'qualificando', position: 1, color: '#000', is_final: false, is_positive: null, created_at: '', updated_at: '' },
]

const mockSources: LeadSourceRecord[] = [
  { id: 'src-1', company_id: 'c1', name: 'WhatsApp', slug: 'whatsapp', color: '#25D366', icon_name: 'message-circle', is_active: true, is_system: true, created_at: '', updated_at: '' },
]

const mockPipelines = [
  { id: 'pipe-1', company_id: 'c1', name: 'Vendas', slug: 'vendas', color: '#000', position: 0, is_default: true, is_active: true, sdr_instance_name: null, sdr_transfer_message_template: null, created_at: '', updated_at: '' },
]

const lookups = { stages: mockStages, sources: mockSources, pipelines: mockPipelines, members: [] }

describe('import-leads.service', () => {
  describe('mapCsvRowToLead', () => {
    it('mapeia uma linha CSV para lead corretamente', () => {
      const row = ['João Silva', '11999887766', 'joao@email.com', 'WhatsApp', 'Qualificando', 'Quente', '1.500,00']
      const mapping = { 0: 'name' as const, 1: 'phone' as const, 2: 'email' as const, 3: 'source_id' as const, 4: 'stage_id' as const, 5: 'temperature' as const, 6: 'deal_value' as const }

      const lead = mapCsvRowToLead(row, mapping, 'pipe-1', 'stage-1', undefined, lookups)

      expect(lead.name).toBe('João Silva')
      expect(lead.phone).toBe('5511999887766')
      expect(lead.email).toBe('joao@email.com')
      expect(lead.source_id).toBe('src-1')
      expect(lead.stage_id).toBe('stage-2') // Qualificando resolvido
      expect(lead.temperature).toBe('hot')
      expect(lead.deal_value).toBe(1500)
    })

    it('usa stage padrão quando nome não encontrado', () => {
      const row = ['Maria', '11888776655', '', '', 'Inexistente', '', '']
      const mapping = { 0: 'name' as const, 1: 'phone' as const, 4: 'stage_id' as const }

      const lead = mapCsvRowToLead(row, mapping, 'pipe-1', 'stage-1', 'src-1', lookups)

      expect(lead.stage_id).toBe('stage-1') // fallback para padrão
      expect(lead.source_id).toBe('src-1')
    })

    it('ignora colunas mapeadas como null', () => {
      const row = ['ID-123', 'João', '11999001122']
      const mapping = { 0: null, 1: 'name' as const, 2: 'phone' as const }

      const lead = mapCsvRowToLead(row, mapping, 'pipe-1', 'stage-1', undefined, lookups)

      expect(lead.name).toBe('João')
      expect(lead.phone).toBe('5511999001122')
    })

    it('normaliza telefone removendo caracteres não numéricos', () => {
      const row = ['', '(11) 99900-1122']
      const mapping = { 1: 'phone' as const }

      const lead = mapCsvRowToLead(row, mapping, 'pipe-1', 'stage-1', undefined, lookups)

      expect(lead.phone).toBe('5511999001122')
    })

    it('parseia valor monetário em formato brasileiro', () => {
      const row = ['', '', '', '', '', '', '2.350,99']
      const mapping = { 6: 'deal_value' as const }

      const lead = mapCsvRowToLead(row, mapping, 'pipe-1', 'stage-1', undefined, lookups)

      expect(lead.deal_value).toBe(2350.99)
    })

    it('parseia tags separadas por vírgula', () => {
      const row = ['', '', 'vip, premium, b2b']
      const mapping = { 2: 'tags' as const }

      const lead = mapCsvRowToLead(row, mapping, 'pipe-1', 'stage-1', undefined, lookups)

      expect(lead.tags).toEqual(['vip', 'premium', 'b2b'])
    })
  })

  describe('validateRow', () => {
    it('retorna null para linha válida', () => {
      const result = validateRow({ phone: '11999887766', stage_id: 'stage-1' }, 0)
      expect(result).toBeNull()
    })

    it('retorna erro para telefone curto', () => {
      const result = validateRow({ phone: '1234', stage_id: 'stage-1' }, 0)
      expect(result).not.toBeNull()
      expect(result?.status).toBe('error')
      expect(result?.reason).toContain('Telefone')
    })

    it('retorna erro para telefone vazio', () => {
      const result = validateRow({ phone: '', stage_id: 'stage-1' }, 0)
      expect(result).not.toBeNull()
      expect(result?.status).toBe('error')
    })

    it('retorna erro para email inválido', () => {
      const result = validateRow({ phone: '11999887766', stage_id: 'stage-1', email: 'invalido' }, 0)
      expect(result).not.toBeNull()
      expect(result?.reason).toContain('Email')
    })

    it('aceita lead sem email', () => {
      const result = validateRow({ phone: '11999887766', stage_id: 'stage-1' }, 0)
      expect(result).toBeNull()
    })
  })
})
