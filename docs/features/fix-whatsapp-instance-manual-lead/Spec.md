# Spec: Fix whatsapp_instance_name na criacao manual de lead

## Arquitetura

### Nova funcao: `resolveWhatsAppInstance`

**Arquivo:** `src/services/leads.service.ts`

```typescript
export async function resolveWhatsAppInstance(
  companyId: string,
  assignedTo?: string | null,
  pipelineId?: string | null,
): Promise<string | null>
```

**Cadeia de fallback (ordem de prioridade):**

1. Verifica `companies.active_whatsapp_provider`. Se nao for `'evolution'`, retorna `null`
2. Se `assignedTo` fornecido, busca `profiles.default_whatsapp_instance`. Se preenchido, retorna
3. Se `pipelineId` fornecido, busca `pipelines.sdr_instance_name`. Se preenchido, retorna
4. Busca primeira instancia com `status = 'connected'` em `evolution_instances` da empresa. Se existe, retorna
5. Retorna `null`

### Integracao: `createLead`

**Arquivo:** `src/services/leads.service.ts`

Antes do INSERT, se `whatsapp_instance_name` nao foi fornecido no input, chama `resolveWhatsAppInstance(companyId, assignedTo, pipelineId)` e preenche o campo.

### Integracao: `importLeads`

**Arquivo:** `src/services/import-leads.service.ts`

Para cada row do CSV, resolve o `whatsapp_instance_name` usando a mesma funcao. Usa cache por chave `assigned_to|pipeline_id` para evitar queries redundantes.

## Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/types/database.ts` | Adiciona `whatsapp_instance_name?: string \| null` em `CreateLeadInput` |
| `src/services/leads.service.ts` | Nova funcao `resolveWhatsAppInstance` + integracao no `createLead` |
| `src/services/import-leads.service.ts` | Import da funcao + integracao no `importLeads` |

## Testes

### Vitest: `src/services/__tests__/resolve-whatsapp-instance.test.ts`

4 cenarios:
1. Vendedor com `default_whatsapp_instance` preenchido -> retorna instancia do vendedor
2. Vendedor sem instancia, pipeline com `sdr_instance_name` -> retorna instancia do pipeline
3. Nenhum dos dois, empresa com instancia connected -> retorna primeira instancia
4. Empresa com Z-API (`active_whatsapp_provider != 'evolution'`) -> retorna null

## Correcao retroativa

SQL para rodar manualmente no SQL Editor do Supabase para corrigir leads existentes:

```sql
-- Preencher whatsapp_instance_name de leads NULL usando default_whatsapp_instance do vendedor atribuido
UPDATE veltzy.leads l
SET whatsapp_instance_name = p.default_whatsapp_instance
FROM public.profiles p
WHERE l.assigned_to = p.id
  AND l.whatsapp_instance_name IS NULL
  AND p.default_whatsapp_instance IS NOT NULL
  AND l.company_id IN (
    SELECT id FROM public.companies
    WHERE active_whatsapp_provider = 'evolution'
  );

-- Para leads sem vendedor atribuido, usar sdr_instance_name do pipeline
UPDATE veltzy.leads l
SET whatsapp_instance_name = pip.sdr_instance_name
FROM veltzy.pipelines pip
WHERE l.pipeline_id = pip.id
  AND l.whatsapp_instance_name IS NULL
  AND pip.sdr_instance_name IS NOT NULL
  AND l.company_id IN (
    SELECT id FROM public.companies
    WHERE active_whatsapp_provider = 'evolution'
  );

-- Para leads restantes, usar primeira instancia connected da empresa
UPDATE veltzy.leads l
SET whatsapp_instance_name = sub.instance_name
FROM (
  SELECT DISTINCT ON (company_id) company_id, instance_name
  FROM public.evolution_instances
  WHERE status = 'connected'
  ORDER BY company_id, created_at ASC
) sub
WHERE l.company_id = sub.company_id
  AND l.whatsapp_instance_name IS NULL
  AND l.company_id IN (
    SELECT id FROM public.companies
    WHERE active_whatsapp_provider = 'evolution'
  );
```

## Dados de teste

| Recurso | ID | Valor |
|---------|-----|-------|
| Empresa Martins e Fernandes | `18a3e126-11d6-4626-b71c-fc0624ae2956` | - |
| Instancia | - | `martins-e-fernandes` |
| Vendedora Silvia | `cad0d94a-5387-4ebc-ba74-3617c181712d` | `default_whatsapp_instance = 'martins-e-fernandes'` |
