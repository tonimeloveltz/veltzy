# Follow-ups - SDR AI v2 - Onda 1.5

> Registradas em 2026-05-28, apos validacao end-to-end da Onda 1.5.

---

## 1. Unificar abas de Features no Hub

**Problema:** A pagina de detalhe da empresa no Hub tem 2 abas separadas: "Features" (companies.features JSONB, flags antigas como ai_sdr_enabled, whatsapp_enabled) e "Feature Flags" (tenant_feature_flags, sistema novo). Duas abas para gerenciar flags e confuso para o super admin.

**Recomendacao:**
- Unificar numa unica aba
- Diferenciar visualmente: features de tenant_feature_flags com moldura na cor do tema (ou badge "novo") para distinguir das antigas
- Avaliar migrar gradualmente as flags antigas de companies.features para tenant_feature_flags, consolidando num sistema unico com audit trail (updated_by, updated_at)

**Prioridade:** Media (UX para super admin, nao afeta usuarios finais)

---

## 2. Repensar metricas do dashboard SDR v2

**Problema:** O dashboard em /sdr-ia mostra metricas de infraestrutura: Custo total R$, Custo medio/conversa R$, Tokens consumidos, Tool calls. Essas sao metricas de controle de margem, relevantes para o Hub (super admin), nao para o admin/manager da empresa no Veltzy. O custo da IA esta embutido no plano -- o usuario nao deve se preocupar com isso.

**Metricas comerciais que deveriam substituir:**
- Conversas qualificadas (leads que passaram por qualify_lead com score > threshold)
- Leads convertidos pela IA (escalados que viraram oportunidade/deal)
- Tempo economizado (estimativa baseada em conversas que o agente resolveu sem humano)
- Taxa de resolucao autonoma (% de conversas concluidas sem escalada)
- Leads escalados que viraram oportunidade (ROI do agente)

**Decisao a tomar -- onde cada metrica fica:**

| Metrica | Onde deveria estar |
|---|---|
| Custo total, custo/conversa, tokens | Hub (dashboard de IA por empresa) |
| Conversas ativas, taxa de escalada | /sdr-ia no Veltzy (operacional do agente) |
| Leads qualificados pela IA, conversoes | Dashboard geral do Veltzy (resultados comerciais) |
| Taxa de resolucao autonoma | /sdr-ia no Veltzy (eficiencia do agente) |

**Considerar:** Algumas dessas metricas comerciais talvez devam migrar para o dashboard geral do Veltzy (nao isoladas em /sdr-ia), porque sao resultados de negocio, nao operacao do agente.

**Prioridade:** Alta (afeta percepcao de valor do produto -- usuario vendo custo de tokens pensa "estou pagando caro", vendo leads qualificados pensa "IA esta funcionando")
