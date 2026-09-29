# Spec: Copiloto exibe JSON cru

> **Onde:** `supabase/functions/ai-copilot/` (ação `sales-pulse`)
> **Status:** Implementada, aguardando deploy e teste no staging
> **Migration:** NENHUMA. Front não muda.
> **Branch:** `fix/copiloto-json-truncado` (a partir da `develop`, ee60a51)

---

## 1. PROBLEMA

Em produção (29/09/2026), o card Copiloto mostrou o JSON da IA em vez do texto:
`{ "situacao": "Leticia Ribeiro possui 36 leads cold...", "alertas": [...], "acoes": [ ... "destino": "inbox" }`.

O texto termina sem `]}`: **a resposta foi cortada**. Cadeia:

1. O `sales-pulse` chama o gateway do Hub com `max_tokens: 500`.
2. Três alertas e três ações com nome, valor e UUID do lead, em pt-BR, já chegam
   perto de 500 tokens. O modelo para no meio do JSON.
3. O `JSON.parse` falha e o `catch` fazia `parsed = { situacao: content, ... }`.
4. O front (`use-sales-pulse.ts:84`) só confere se `situacao` é string, aceita e
   exibe o JSON inteiro como a frase de situação.

`ai-copilot` (v29, 01/09) e `ai-complete` (v24, 08/08) não mudaram em produção. O
gatilho provável é o volume de dados, ou troca de modelo na config de IA da empresa.
A correção vale para os dois.

## 2. CORREÇÃO

1. `max_tokens` de 500 para 1200.
2. Parse extraído para `parse-sales-pulse.ts` (função pura):
   - tira a cerca ```` ```json ```` quando o modelo embrulha;
   - exige `situacao` string não vazia; `alertas`/`acoes` fora de formato viram `[]`;
   - JSON inválido ou cortado devolve `null`.
3. Com `null`, a edge responde `{ ok: false, error: { code: 'INVALID_AI_RESPONSE' } }`
   (HTTP 200) e loga `finish_reason`, `model`, `completion_tokens` e o tamanho do
   conteúdo. O front já trata `ok: false` como "cair no fallback heurístico".

**Não entra:** mudar o prompt, o front, o cache do `sessionStorage` ou o gateway.

## 3. RESÍDUO DE CACHE

O front guarda o pulse no `sessionStorage` por dia. Quem já recebeu o JSON quebrado
continua vendo até clicar em atualizar no card ou abrir uma aba nova. Não precisa de
código: o cache é por aba e expira no dia seguinte.

## 4. CRITÉRIOS DE ACEITE

**Automáticos:**
1. `npx --yes deno test supabase/functions/ai-copilot/parse-sales-pulse.test.ts`:
   5 testes passam, incluindo o JSON cortado do caso de produção.
2. `npx --yes deno check supabase/functions/ai-copilot/index.ts`: **sem erro novo**.
   Em 29/09 já havia 6 erros antes da mudança (linhas 134, 334, 382, 383, 427), todos
   fora das linhas tocadas.
3. `npx eslint supabase/functions/ai-copilot/` sem erro.

**No staging, depois do deploy do `ai-copilot`:**
4. Dashboard com o card Copiloto, clicar em atualizar: aparece a frase de situação
   em texto, com alertas e ações como lista. Nenhum `{` ou `"situacao"` visível.
5. Logs do `ai-copilot` no dashboard do Supabase: nenhuma linha
   `[ai-copilot] sales-pulse invalido`. Se aparecer, o `finish_reason` diz se ainda
   é corte (`length`) ou formato.

**Em produção, depois da promoção:** repetir o 4 com a mesma empresa do print.
