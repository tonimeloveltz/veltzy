# Testes Manuais - SDR AI v2 - Onda 1

> Bateria de testes para validacao da Onda 1 antes do merge em develop.
> Executor: Toni | Data prevista: 2026-05-26

---

## Pre-requisitos

- App rodando em `npm run dev` ou preview Vercel
- Usuario logado como admin de empresa com pelo menos 1 pipeline ativo
- Edge Functions `sdr-engine` e `sdr-knowledge-ingest` deployadas
- Hub com `ai-complete` operacional (necessario para sandbox)

---

## 1. Wizard - Criar Agent Profile

### 1.1 Fluxo guiado (modo padrao)

- [ ] Navegar para `/sdr-ia` > aba "Configuracao"
- [ ] Selecionar pipeline no dropdown (deve listar todos os pipelines da empresa)
- [ ] Clicar "Criar Agent Profile" (aparece quando pipeline nao tem perfil)
- [ ] Wizard abre no modo guiado (4 steps: Identidade, Empresa, Proposito, Revisao)
- [ ] Step Identidade: preencher nome do agente, selecionar genero, tom, personalidade, toggle "Revelar que e IA"
- [ ] Step Empresa: preencher descricao, proposta de valor, diferenciais, ICP
- [ ] Step Proposito: selecionar proposito (ex: qualification), tools pre-selecionadas automaticamente, preencher objetivo principal
- [ ] Step Revisao: todos os campos preenchidos aparecem no resumo, campos obrigatorios faltando mostram alerta vermelho
- [ ] Clicar "Criar Agent Profile" na revisao
- [ ] Toast de sucesso aparece
- [ ] Wizard fecha, info card aparece com dados salvos

### 1.2 Modo avancado

- [ ] Clicar "Avancado" no wizard (canto superior direito)
- [ ] 7 steps aparecem (Identidade, Empresa, Proposito, Comportamento, Guardrails, Conhecimento, Revisao)
- [ ] Step Comportamento: campos de max iteracoes, max tokens, max valor pagamento, horario comercial (dia + hora)
- [ ] Step Guardrails: topicos proibidos, keywords de escalada, guardrails customizados
- [ ] Step Conhecimento: mostra "Salve o Agent Profile primeiro" se for criacao nova (sem ID)
- [ ] Navegar entre steps (Proximo/Voltar) funciona corretamente
- [ ] Clicar diretamente nos circulos dos steps tambem navega

### 1.3 Cancelamento

- [ ] Clicar "Cancelar" em qualquer step fecha o wizard sem salvar
- [ ] Info card anterior (se existia) reaparece normalmente

---

## 2. Wizard - Editar Agent Profile existente

- [ ] Na aba Configuracao, com agent profile ja criado, clicar botao "Editar"
- [ ] Wizard abre no modo avancado (7 steps) com dados pre-preenchidos do perfil existente
- [ ] Alterar um campo (ex: nome do agente)
- [ ] Navegar ate Revisao e clicar "Salvar alteracoes"
- [ ] Toast de sucesso
- [ ] Info card atualizado com o novo valor

---

## 3. Ativar/Desativar Agent Profile

- [ ] Botao "Ativar" aparece quando is_active = false
- [ ] Clicar "Ativar" -> botao muda para "Desativar" (vermelho)
- [ ] Clicar "Desativar" -> botao muda para "Ativar" (azul)
- [ ] Nao ha duplo-click (botao desabilitado durante mutacao)

---

## 4. Knowledge Base (upload de documentos)

### 4.1 Upload

- [ ] Editar agent profile existente, ir para step "Conhecimento" (step 6 no modo avancado)
- [ ] Clicar "Upload de documento"
- [ ] Selecionar arquivo PDF, DOCX, TXT ou MD (< 10MB)
- [ ] Barra de status: "Enviando..." -> "Processando..." -> "Documento processado com sucesso"
- [ ] Arquivo aparece na lista com nome e tamanho
- [ ] Contador atualiza (ex: 1/10 arquivos)

### 4.2 Limites

- [ ] Tentar upload de arquivo > 10MB -> erro exibido
- [ ] Tentar upload de formato nao aceito (ex: .jpg) -> input nao permite selecao
- [ ] Upload desabilitado quando ja tem 10 arquivos

### 4.3 Exclusao

- [ ] Clicar icone de lixeira ao lado do arquivo
- [ ] Arquivo removido da lista
- [ ] Toast de confirmacao

---

## 5. Sandbox

### 5.1 Acesso e layout

- [ ] Navegar para aba "Sandbox"
- [ ] Se nao tem agent profile: mensagem "Configure um Agent Profile antes de usar o sandbox"
- [ ] Se tem agent profile: chat area a direita, resumo do profile a esquerda
- [ ] Resumo mostra: nome, tom, personalidade, proposito, objetivo, tools, KB status

### 5.2 Conversa

- [ ] Digitar mensagem e pressionar Enter (ou botao Send)
- [ ] Indicador "Pensando..." aparece enquanto aguarda resposta
- [ ] Resposta do agente aparece em bolha cinza (esquerda)
- [ ] Mensagens do usuario em bolha azul (direita)
- [ ] Scroll automatico para ultima mensagem

### 5.3 Tool calls

- [ ] Enviar mensagem que acione uma tool (ex: "quero saber mais sobre o produto" -> query_business_knowledge)
- [ ] Card de tool call aparece abaixo da resposta do agente
- [ ] Clicar no card expande/colapsa mostrando args e resultado
- [ ] Tool `qualify_lead`: verificar que args incluem score e temperatura
- [ ] Tool `escalate_to_human`: enviar "quero falar com um humano" e verificar que tool e acionada

### 5.4 Protecao sandbox

- [ ] Conversas no sandbox NAO sao salvas em `sdr_conversations` (verificar no banco)
- [ ] Mensagens no sandbox NAO aparecem no inbox do lead
- [ ] Tool calls no sandbox NAO alteram dados reais do lead (score, temperatura, etc.)

### 5.5 Limpar

- [ ] Clicar "Limpar" reseta o historico de mensagens
- [ ] Nova conversa comeca do zero

---

## 6. Dashboard

### 6.1 KPIs

- [ ] Navegar para aba "Dashboard"
- [ ] 8 cards de KPI: Conversas iniciadas, Conversas ativas, Taxa de qualificacao, Escaladas p/ humano, Custo total (R$), Custo medio/conversa (R$), Tokens consumidos, Tool calls
- [ ] Valores zerados quando nao ha dados (nao deve mostrar NaN ou undefined)
- [ ] Skeletons durante loading

### 6.2 Filtros

- [ ] Filtro de pipeline: "Todos os pipelines" (default) + cada pipeline individualmente
- [ ] Filtro de periodo: Hoje, 7 dias, 30 dias (default), 90 dias
- [ ] Mudar filtro atualiza KPIs e tabela

### 6.3 Tabela de conversas

- [ ] Colunas: Lead (nome + telefone), Pipeline, Status (badge colorido), Iteracoes, Tokens, Custo, Ultima atividade
- [ ] Status badges com cores corretas: Ativa (verde), Escalada (laranja), Concluida (azul), Abandonada (cinza), Falha (vermelho)
- [ ] "Nenhuma conversa no periodo selecionado" quando vazio

---

## 7. Roteamento (lead-inbound-handler)

### 7.1 Dispatch SDR v2

- [ ] Enviar mensagem WhatsApp para numero de pipeline com agent_profile ativo (is_active=true)
- [ ] Lead com is_ai_active=true
- [ ] Verificar nos logs da Edge Function que `sdr-engine` foi chamado (e nao `sdr-ai`)
- [ ] Resposta do agente chega no WhatsApp do lead

### 7.2 Backward compatibility (SDR v1)

- [ ] Pipeline SEM agent_profile ativo -> mensagem roteada para `sdr-ai` (v1)
- [ ] Pipeline com agent_profile mas is_active=false -> roteada para `sdr-ai` (v1)
- [ ] Lead com is_ai_active=false -> nenhum SDR acionado

### 7.3 Condicoes de borda

- [ ] Lead sem pipeline_id -> sdr-engine retorna erro "Lead sem pipeline_id"
- [ ] Pipeline sem agent_profile -> sdr-engine retorna 404

---

## 8. RLS e multi-tenant

- [ ] Empresa A nao ve agent_profiles da Empresa B
- [ ] Dashboard filtra por company_id automaticamente (RLS)
- [ ] Sandbox so funciona com leads da propria empresa
- [ ] Knowledge Base isolada por empresa (Storage path: company_id/agent_profile_id/)

---

## 9. UI/UX geral

- [ ] Nao existe botao "Testar" redundante na aba Configuracao (removido)
- [ ] Tab "Sandbox" e o unico ponto de acesso ao sandbox de teste
- [ ] Botao "Editar" na Configuracao abre o wizard corretamente
- [ ] Pagina funciona nos 3 temas: light, dark, sand
- [ ] Responsivo: layout funcional em tela >= 1024px (desktop)
- [ ] Nenhum texto com em-dash (--) no lugar

---

## 10. Edge Functions

### 10.1 sdr-engine

- [ ] Responde 400 quando faltam campos obrigatorios (leadId, companyId, messageContent)
- [ ] Responde 404 quando lead nao existe
- [ ] Responde 404 quando agent_profile nao existe para o pipeline
- [ ] Responde 400 quando agent_profile.is_active=false (fora do sandbox)
- [ ] Em sandbox (sandbox=true): pula validacoes de is_active e is_ai_active
- [ ] Budget enforcer: conversa encerra quando max_iterations atingido
- [ ] Guardrail checker: valida resposta antes de enviar

### 10.2 sdr-knowledge-ingest

- [ ] Processa PDF -> extrai texto -> gera chunks -> salva embeddings
- [ ] Atualiza knowledge_base_status: 'empty' -> 'processing' -> 'ready'
- [ ] Em caso de erro: knowledge_base_status = 'error'

---

## Criterio de aprovacao

Todos os itens acima marcados com [x]. Nenhum blocker.
Apos aprovacao: merge `feature/sdr-ai-v2-onda1` em `develop` via PR.
