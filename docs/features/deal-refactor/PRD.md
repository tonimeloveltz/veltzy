# PRD - Refatoracao: Entidade Deal + Conflito de Territorio

## Contexto

O Veltzy opera hoje com `lead` como entidade central do pipeline. Um lead representa ao mesmo tempo o contato humano e o ciclo comercial. Isso impede que o mesmo contato tenha multiplos negocios em andamento simultaneamente.

Este PRD cobre Fase 1 + Fase 2 da refatoracao:
- Fase 1: criar entidade `deals` e migrar dados existentes
- Fase 2: UI do kanban e pagina de Negocios passam a ler de `deals`

A Fase 0 (campo `company_name`) e independente e ja tem prompt proprio.

---

## Problema

1. Um contato que pede dois orcamentos simultaneos precisa ser cadastrado duas vezes, gerando duplicata de contato e fragmentacao do historico de conversa.

2. Quando um contato ja existente entra por uma campanha nova (pipeline diferente), o sistema nao tem como detectar o conflito de territorio e pode atribuir o deal a um vendedor diferente do dono original, gerando atrito no time comercial.

---

## Naming definitivo

| Entidade | Tabela | UI | Descricao |
|---|---|---|---|
| Contato | `veltzy.leads` | Contato | Pessoa fisica. Telefone, historico de conversa, instancia WhatsApp. |
| Empresa do cliente | `company_name` (campo texto em leads) | Empresa | Empresa que o contato representa. |
| Negocio | `veltzy.deals` (novo) | Negocio | Ciclo comercial. Valor, stage, pipeline, status, dono. |

---

## Requisitos Funcionais

### RF-01: Entidade Deal
- Cada deal pertence a um contato (`lead_id`)
- Um contato pode ter N deals simultaneos
- Deal tem: nome, valor, stage, pipeline, status, vendedor dono (`assigned_to`), data de criacao
- Status possiveis: `open`, `won`, `lost`, `archived`, `pending_assignment`

### RF-02: Criacao de deal
- Ao criar contato novo: sistema cria contato + primeiro deal automaticamente (fluxo atual preservado)
- A partir de contato existente: botao "Novo negocio" no perfil/chat do contato
- Via inbound automatico (WhatsApp): ver RF-05

### RF-03: Kanban
- Card no kanban representa um deal, nao um contato
- Card exibe: nome do contato + nome do negocio + valor + temperatura
- Um contato pode ter multiplos cards no kanban (um por deal ativo)
- Drag & drop funciona por deal normalmente

### RF-04: Pagina de Negocios
- Lista deals, nao leads
- Colunas: Contato, Empresa, Negocio, Valor, Stage, Pipeline, Vendedor, Data
- Filtros existentes continuam funcionando (periodo, pipeline, vendedor)
- KPIs agregam por deal

### RF-05: Conflito de territorio (inbound automatico)
Quando mensagem WhatsApp chega de contato ja existente na base:

**Sem conflito** (mesmo pipeline ou mesmo vendedor):
- Cria deal novo vinculado ao contato existente
- Atribui ao mesmo vendedor do contato
- Fluxo normal

**Com conflito** (pipeline diferente E vendedor diferente):
- Cria deal com `status = 'pending_assignment'`
- Deal fica visivel no kanban em coluna/estado especial "Sem dono"
- Chat fica visivel e respondivel por qualquer vendedor (sem dono definido)
- Dispara notificacao para gestor/admin via central de notificacoes existente
- Notificacao: "[Contato] ja atendido por [Vendedor A]. Nova entrada em [Pipeline X]. Clique para atribuir."
- Ao clicar na notificacao: abre modal de atribuicao direto na central de notificacoes
- Gestor escolhe vendedor e confirma
- Deal sai de `pending_assignment` para `open` com vendedor definido

### RF-06: Chat/Inbox
- Chat continua vinculado ao contato (lead_id), nao ao deal
- Historico de conversa e unico por contato
- Painel lateral no chat exibe deals ativos do contato com status rapido
- Mensagens nao sao vinculadas a deals especificos (sem complexidade adicional)

---

## Requisitos Nao Funcionais

### RNF-01: Migracao de dados
- Cada lead existente com `stage_id` ou `deal_value` gera um deal automaticamente
- Migration e idempotente (pode rodar mais de uma vez sem duplicar)
- Leads sem stage e sem valor tambem geram deal (para nao perder nenhum contato)
- `assigned_to`, `stage_id`, `pipeline_id`, `deal_value` do lead viram o deal
- Lead original nao e deletado nem alterado estruturalmente

### RNF-02: Retrocompatibilidade
- RLS por `company_id` em `deals` segue padrao existente
- Triggers de activity_logs adaptados para deals
- Kanban e pagina de Negocios continuam funcionando sem interrupcao (staging primeiro)

### RNF-03: Performance
- Index em `deals.lead_id`, `deals.company_id`, `deals.stage_id`, `deals.assigned_to`
- Queries de kanban nao devem degradar

---

## Fora do Escopo

- Renomear "lead" para "contato" na UI (Fase 3, sessao futura)
- Entidade Company separada (futuro)
- Vincular mensagens a deals especificos (futuro)
- Permissoes por pipeline/deal (futuro)
- Comparacao entre deals do mesmo contato (futuro)
