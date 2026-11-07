# SPEC: Importação sugere completar leads já cadastrados

Trilha: M
Início: 2026-11-06 20:57
Merge: (preencher no merge)

Sem schema, sem Hub, sem Edge Function.

## Contexto
- `importLeads` (`src/services/import-leads.service.ts`) pula toda linha cujo telefone já existe na empresa ("Telefone já cadastrado").
- Lead que entrou pelo WhatsApp costuma estar só com telefone: na Veltz Group, 91 leads com `name` nulo e 25 com `name` só de dígitos.
- Resultado: a planilha tem o nome, o CRM não, e o import descarta a informação.

## O que entra / o que não entra
Entra:
- Ao pular por telefone duplicado, o import compara o lead existente com a linha da planilha e monta uma **sugestão de atualização** quando a planilha tem dado que falta no CRM.
- Campos completáveis: **nome** (com sobrenome, se mapeado) quando o lead está sem nome (nulo, vazio ou só dígitos) e **email** quando o lead está sem email.
- Na tela de resultado: bloco "Leads já cadastrados com dados faltando" com lista (telefone, como está, como fica), checkbox por linha (todas marcadas), "marcar todos" e botão "Atualizar N leads". Cobre lote e um por um.
- Depois de atualizar: contagem de atualizados / falhas no próprio bloco.

Não entra:
- Sobrescrever dado que já existe no CRM (nome real, email preenchido).
- Outros campos (etapa, responsável, tags, observações, temperatura).
- Renomear o negócio (o card do pipeline já mostra o nome do lead).

## Arquivos
<!-- arquivos -->
specs/import-atualizar-existentes/SPEC.md
src/lib/import-lead-updates.ts
src/lib/import-lead-updates.test.ts
src/services/import-leads.service.ts
src/hooks/use-apply-lead-updates.ts
src/components/pipeline/import-steps/update-existing-leads.tsx
src/components/pipeline/import-steps/result-step.tsx
<!-- /arquivos -->

## O que fazer em cada arquivo
- `src/lib/import-lead-updates.ts`: funções puras `isPlaceholderName(name)` e `buildLeadUpdateSuggestion(existing, row, rowIndex)`; retorna `null` quando não há o que completar.
- `src/lib/import-lead-updates.test.ts`: casos de nome nulo, vazio, só dígitos, nome real, email vazio/preenchido, com e sem sobrenome.
- `src/services/import-leads.service.ts`: `checkDuplicates` passa a devolver `Map<phone, ExistingLead>` (id, name, email); `ImportBatchResult.updateSuggestions`; motivo do pulado vira "Telefone já cadastrado, dá para completar os dados" quando há sugestão; nova `applyLeadUpdates(companyId, suggestions)` (update por lead, filtrando `company_id`, só nos campos sugeridos).
- `src/hooks/use-apply-lead-updates.ts`: mutation que chama `applyLeadUpdates` e invalida `leads`/`deals`.
- `update-existing-leads.tsx`: bloco de seleção e aplicação.
- `result-step.tsx`: renderiza o bloco quando há sugestões.

## Decisões tomadas
- Só completa campo vazio, nunca sobrescreve: evita trocar um nome bom por um errado da planilha.
- "Sem nome" = nulo, vazio ou só dígitos/símbolos de telefone: é como o WhatsApp deixa o lead quando não há pushname.
- Sugestão aparece depois do import, na tela de resultado: o import novo segue igual e a atualização é um passo explícito, com escolha por linha.
- Com sobrenome mapeado grava `first_name`/`last_name`; sem, grava `name` e o trigger `sync_name_parts` faz o split (mesma regra do insert).
- Todas as linhas vêm marcadas: o caso comum é atualizar tudo; desmarcar é a exceção.
- Telefone repetido dentro da própria planilha: vale a primeira linha com dado.
