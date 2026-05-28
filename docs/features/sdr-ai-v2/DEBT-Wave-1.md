# Dividas Tecnicas - SDR AI v2 - Onda 1

> Registradas em 2026-05-28, apos bateria de testes automatizados.
> Resolver antes de GA ou na Onda seguinte apropriada.

---

## 1. Sandbox usa leadId fixo (placeholder)

**Onde:** `src/pages/sdr-ia.tsx:26`
**O que:** `testLeadId = '376d8927-...'` hardcoded. Se o lead nao existe na empresa logada, sandbox quebra.
**Fix:** Buscar o primeiro lead do pipeline selecionado dinamicamente, ou criar um lead virtual em memoria para sandbox.
**Prioridade:** Media (funciona no dev/staging com o lead existente, mas falha em empresas novas).

## 2. sdr-knowledge-ingest nao valida mime type antes de baixar

**Onde:** `supabase/functions/sdr-knowledge-ingest/index.ts`
**O que:** O fluxo e: recebe `fileMimeType` -> baixa arquivo -> `extractText()` valida no switch/case. Se mime type invalido chega, baixa o arquivo inteiro antes de rejeitar. Se a URL for invalida, retorna 500 generico.
**Mitigacao atual:** O bucket Storage (`053_sdr_v2_storage.sql`) tem `allowed_mime_types` que rejeita upload de tipos invalidos. Mas se chamarem a Edge Function diretamente com URL externa, nao tem validacao.
**Fix:** Adicionar guard no inicio: `if (!SUPPORTED_MIMES.includes(fileMimeType)) return 400`.
**Prioridade:** Baixa (mitigado pelo bucket, so afeta chamadas diretas a funcao).

## 3. qualify_lead nao testado em conversa multi-turn

**Onde:** `supabase/functions/sdr-engine/tools/qualify-lead.ts`
**O que:** Nos testes automatizados (B.2), o LLM respondeu sem chamar qualify_lead em uma unica mensagem. O tool call de qualificacao tipicamente acontece apos 2-3 turns de conversa quando o lead revela informacoes suficientes.
**Fix:** Nao e bug. Precisa de teste ao vivo com conversa longa para validar que a qualificacao dispara naturalmente.
**Prioridade:** Media (testar no teste ao vivo com WhatsApp).

## 4. GuardrailChecker: warnings sao apenas console.warn

**Onde:** `supabase/functions/sdr-engine/guardrail-checker.ts:66-68`
**O que:** Warnings de preco sem KB e promessa de prazo sao logados no console, mas nao sao persistidos, notificados ou exibidos na UI. Apenas `forceEscalate` (keyword de escalada) tem acao concreta.
**Fix:** Persistir warnings em `sdr_tool_calls` ou novo campo em `sdr_conversations`. Exibir no dashboard. Opcional: enviar alerta ao admin.
**Prioridade:** Baixa (monitoring, nao funcionalidade).

## 5. MemoryManager nao comprime historico longo

**Onde:** `supabase/functions/sdr-engine/memory-manager.ts`
**O que:** PRD especifica hot cache pattern (ultimas 20 msgs cruas, anteriores comprimidas em resumo via LLM). Implementacao atual carrega as ultimas 20 sem compressao das anteriores.
**Fix:** Implementar compressao quando total de mensagens > 20. Chamar LLM para gerar resumo das msgs antigas.
**Prioridade:** Baixa (maioria das conversas SDR nao ultrapassa 20 msgs na Onda 1 -- relevante quando follow-up entrar na Onda 3).

## 6. Dashboard: custo em BRL usa conversao fixa

**Onde:** `src/types/sdr-v2.ts:197` e `src/components/sdr-v2/dashboard/SdrV2Dashboard.tsx:119`
**O que:** `USD_TO_BRL = 5.0` hardcoded. PRD menciona tabela `currency_rates` ou hardcoded por enquanto.
**Fix:** Quando Hub tiver tabela `currency_rates`, ler de la. Por enquanto, aceitavel.
**Prioridade:** Baixa (decisao documentada no PRD).

## 7. Suggest-mode nao implementado

**Onde:** `supabase/functions/sdr-engine/index.ts:83`
**O que:** `operating_mode !== 'full_auto'` retorna 400. Planejado para Onda 3.
**Fix:** N/A -- Onda 3.
**Prioridade:** N/A (roadmap).

## 8. Follow-up scheduler nao implementado

**Onde:** N/A (nao existe ainda)
**O que:** `schedule_followup` e `end_conversation` tools nao registradas. `sdr-followup-scheduler` cron nao existe.
**Fix:** N/A -- Onda 3.
**Prioridade:** N/A (roadmap).
