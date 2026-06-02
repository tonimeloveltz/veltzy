# PRD: Fix whatsapp_instance_name na criacao manual de lead

## Problema

Leads criados manualmente (modal "Novo Lead") e via CSV import ficam com `whatsapp_instance_name = NULL` na tabela `veltzy.leads`. Isso torna o lead "mudo": o chat nao envia nem recebe mensagens pelo WhatsApp.

Leads que entram via webhook Evolution (`evolution-inbound`) tem o campo preenchido corretamente. A falha e exclusiva dos fluxos manuais.

### Evidencia em producao (Martins e Fernandes)

| Lead | Criacao | whatsapp_instance_name | Chat |
|------|---------|----------------------|------|
| Rebeca Maia | Manual | NULL | Nao funciona |
| Roberta Lassandro | Webhook | martins-e-fernandes | Funciona |

## Solucao

Resolver automaticamente o `whatsapp_instance_name` no momento da criacao do lead, usando uma cadeia de fallback:

1. `profiles.default_whatsapp_instance` do vendedor atribuido (`assigned_to`)
2. `pipelines.sdr_instance_name` do pipeline selecionado
3. Primeira instancia com `status = 'connected'` da empresa em `evolution_instances`
4. `NULL` (empresa sem Evolution ou sem instancias)

### Condicao de ativacao

A resolucao so roda quando `companies.active_whatsapp_provider = 'evolution'`. Para empresas com Z-API, o campo continua NULL (Z-API usa outro mecanismo).

## Escopo

### Inclui
- Fix no `createLead` (criacao manual via modal)
- Fix no `importLeads` (CSV import)
- SQL de correcao retroativa para leads existentes
- Testes unitarios da funcao de resolucao

### Nao inclui
- Mudancas em Edge Functions (evolution-inbound ja funciona)
- Migration SQL (campo ja existe)
- Mudancas em RLS
- Fix no source-webhook (Edge Function, fora do escopo frontend)

## Metricas de sucesso

- 100% dos leads criados manualmente em empresas Evolution tem `whatsapp_instance_name` preenchido
- Chat funciona imediatamente apos criacao manual do lead
- Zero regressao em leads criados via webhook
