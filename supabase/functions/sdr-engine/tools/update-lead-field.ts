/**
 * Tool: update_lead_field
 * Atualiza campos do lead durante conversa (nome, email, empresa, observacoes, tags).
 * Sandbox: retorna campos que seriam atualizados sem alterar leads no banco.
 */

import { ToolDefinition, ToolResult, ToolContext } from '../tool-registry.ts'

export const updateLeadFieldTool: ToolDefinition = {
  name: 'update_lead_field',

  description:
    'Atualize campos do lead conforme ele compartilha informacao. ' +
    'Use observations para anotar contexto importante. ' +
    'Use tags para classificar (ex: \'b2b\', \'enterprise\', \'urgente\'). ' +
    'Nao invente dados, so registre o que lead disse.',

  parameters: {
    name: { type: 'string', description: 'Nome do lead' },
    email: { type: 'string', description: 'Email do lead' },
    observations: { type: 'string', maxLength: 1000, description: 'Observacoes sobre o lead' },
    tags_to_add: { type: 'array', items: { type: 'string' }, description: 'Tags para adicionar' },
    tags_to_remove: { type: 'array', items: { type: 'string' }, description: 'Tags para remover' },
  },
  required: [],

  validate(args: Record<string, unknown>): { ok: boolean; error?: string } {
    if (args.email !== undefined && typeof args.email === 'string') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
        return { ok: false, error: 'Email invalido' }
      }
    }
    if (args.observations !== undefined && typeof args.observations === 'string') {
      if (args.observations.length > 1000) {
        return { ok: false, error: 'observations deve ter no maximo 1000 caracteres' }
      }
    }
    // Pelo menos um campo deve ser informado
    const hasField = ['name', 'email', 'observations', 'tags_to_add', 'tags_to_remove']
      .some((f) => args[f] !== undefined)
    if (!hasField) {
      return { ok: false, error: 'Pelo menos um campo deve ser informado' }
    }
    return { ok: true }
  },

  async handler(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const updatedFields: string[] = []
    const updateData: Record<string, unknown> = {}

    // Campos diretos (nao permite sobrescrever com string vazia)
    for (const field of ['name', 'email', 'observations'] as const) {
      const value = args[field]
      if (value !== undefined && typeof value === 'string' && value.trim() !== '') {
        updateData[field] = value.trim()
        updatedFields.push(field)
      }
    }

    // Tags: merge com array existente
    let tagsChanged = false
    if (args.tags_to_add || args.tags_to_remove) {
      const currentTags: string[] = (ctx.lead.tags as string[] | null) ?? []
      let newTags = [...currentTags]

      if (Array.isArray(args.tags_to_add)) {
        for (const tag of args.tags_to_add) {
          if (typeof tag === 'string' && !newTags.includes(tag)) {
            newTags.push(tag)
          }
        }
      }
      if (Array.isArray(args.tags_to_remove)) {
        newTags = newTags.filter((t) => !(args.tags_to_remove as string[]).includes(t))
      }

      updateData.tags = newTags
      tagsChanged = true
      updatedFields.push('tags')
    }

    // Sandbox: retorna campos que seriam atualizados sem alterar banco
    if (ctx.isSandbox) {
      return { ok: true, data: { updatedFields, sandbox: true } }
    }

    if (Object.keys(updateData).length > 0) {
      await ctx.supabase
        .from('leads')
        .update(updateData)
        .eq('id', ctx.lead.id)
    }

    return { ok: true, data: { updatedFields } }
  },
}
