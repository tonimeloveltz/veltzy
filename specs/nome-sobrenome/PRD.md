# PRD: Nome e sobrenome do lead

Trilha: G
Início: 2026-11-03 15:40
Merge: (preencher no merge)

## Problema e objetivo
Hoje o lead tem só `name` (nome completo, texto livre). A variável `{{nome}}` de campanhas e cadências sai com o nome completo ("Olá, Maria Aparecida Souza"), o que soa robótico. Não existe como tratar o lead só pelo primeiro nome nem usar o sobrenome isolado.

Objetivo: decompor o nome em primeiro nome e sobrenome, sem quebrar nada que hoje lê `name`, e fazer `{{nome}}` sair com o primeiro nome.

## Estado atual (codebase e schema)
- `veltzy.leads.name text` (nullable). Triggers atuais: `on_lead_activity` (AFTER INSERT/UPDATE, loga criação e troca de responsável) e `on_updated` (BEFORE UPDATE, `updated_at`).
- Staging: 104 leads, 82 com espaço no nome, 12 placeholder (nulo, vazio, `Contato %` ou só dígitos).
- Cerca de 10 writers automáticos gravam só `name`: `lead-inbound-handler`, `instagram-webhook`, `prospect-create-lead-deal`, import, SDR `update_lead_field` etc.
- Render de mensagem livre: `supabase/functions/_shared/blast-render.ts` (`FREE_VAR_MAP`: nome, telefone, empresa). Usado em `blast-dispatch`.
- `process-cadences` (`send_message`) enfileira `cfg.content` cru: `{{nome}}` vaza literal para o lead. Bug.
- Formulários de lead (criação e edição) têm um único campo "Nome".

## Requisitos funcionais
1. `veltzy.leads` ganha `first_name text` e `last_name text`, ambos nullable. `name` continua canônico (nome completo); toda exibição no app segue usando `name`.
2. O banco mantém as três colunas coerentes via trigger:
   - escrita com `first_name`/`last_name` recompõe `name`;
   - escrita só com `name` (writers automáticos) faz o split: primeira palavra em `first_name`, resto em `last_name`;
   - nome placeholder (nulo, vazio, `Contato %`, só dígitos/telefone) deixa `first_name`/`last_name` nulos.
3. Backfill dos leads existentes com a mesma regra.
4. Variáveis de mensagem: `{{nome}}` = primeiro nome, `{{sobrenome}}`, `{{nome_completo}}`, além das atuais `{{telefone}}` e `{{empresa}}`. Campanhas e cadências existentes passam a sair com o primeiro nome (aceito pelo Toni).
5. Cadência `send_message` passa a renderizar as variáveis (corrige o vazamento de `{{nome}}`).
6. Mapping de template (campanha): opções Primeiro nome (novo default), Sobrenome, Nome completo, Empresa.
7. Formulários: "Nome" (obrigatório) + "Sobrenome" (opcional) na criação e edição de contato (modal de novo contato, modal de edição do pipeline, painel do contato no inbox). Gravam `first_name`/`last_name`; `name` vem do trigger.
8. Import de planilha aceita coluna de sobrenome (`sobrenome`, `last name`, `last_name`, `surname`).

## Repos envolvidos e contrato entre eles
- **Hub**: cria e aplica a migration no staging (B1). Dono do schema.
- **Veltzy**: consome as colunas novas (B2, B3). Só começa depois do B1 aplicado no staging.
- Contrato: colunas `veltzy.leads.first_name` e `veltzy.leads.last_name`, mais o trigger `sync_name_parts`. Writers que gravam só `name` continuam funcionando sem mudança.

## Modelo de dados
`veltzy.leads`
| coluna | tipo | null | origem |
|---|---|---|---|
| name | text | sim | canônico; recomposto pelo trigger quando first/last mudam |
| first_name | text | sim | novo |
| last_name | text | sim | novo |

Funções novas: `veltzy.split_lead_name(text)` (pura) e `veltzy.sync_lead_name_parts()` (trigger). RLS da tabela não muda (colunas novas herdam as policies existentes). SQL completo na SPEC.

## LGPD
Sem dado pessoal novo: `first_name`/`last_name` são decomposição do `name` que já existe, com a mesma finalidade, base legal, retenção e exclusão do lead.

## O que não entra
- Mudança nos writers automáticos (edge functions de inbound, Instagram, prospecção, SDR).
- Mudança na exibição do nome no app (continua `name`).
- Mudança na RPC `get_conversation_list`.
- Capitalização ou correção de nomes.

## Critérios de aceite
- Lead criado só com `name = 'Maria Aparecida Souza'` fica com `first_name = 'Maria'`, `last_name = 'Aparecida Souza'`.
- Lead criado com first/last recebe `name` composto.
- Editar sobrenome no app atualiza `name`.
- Placeholder (`Contato 1234`, `5511999999999`, vazio) fica com first/last nulos.
- Backfill aplicado: nenhum lead não placeholder com `first_name` nulo.
- Campanha livre e cadência `send_message` com `{{nome}}` saem com o primeiro nome; `{{sobrenome}}` e `{{nome_completo}}` funcionam; nenhuma variável vaza crua.
- Import com coluna de sobrenome grava first/last.

## Decisões tomadas
- Ver SPEC.md, seção "Decisões tomadas".
