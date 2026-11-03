# SPEC: Variações da mensagem de campanha com IA

Trilha: G
Início: 2026-11-03 16:45
Merge: 2026-11-03 17:14

## Contexto
- `blast-dispatch/index.ts`: `isFreeText = !campaign.template_id`; `bodyText = message_body`; cria `blast_recipients` por upsert (`onConflict: 'campaign_id,lead_id', ignoreDuplicates: true`); `computeBlastSchedule` decide `scheduled_at` por índice da audiência; `queueRows` usa `renderMessageBody(bodyText, lead)`. Auth manual (`authenticate`: getUser + `profiles.company_id` + papel admin/manager/super_admin).
- `_shared/blast-render.ts`: `renderMessageBody` + `FREE_VAR_MAP` (`nome`, `sobrenome`, `nome_completo`, `telefone`, `empresa`).
- `_shared/hub-client.ts`: `HubClient.complete({ company_id, product: 'veltzy', feature, messages, tools?, max_tokens, temperature })`. Saída estruturada no gateway é por `tools` (não há `response_format`); a resposta vem em `data.tool_calls[0].function.arguments`.
- `public.ai_features` (catálogo, precedência sobre `ai_model_config` global): `UNIQUE (product, feature_key)`, `CHECK product IN (veltzy, leadbaze, powerv)`. Features do Veltzy no staging hoje: `ai_copilot`, `audio_transcription`, `sdr_engine`, `sdr_knowledge_ingest`, `sdr_knowledge_search`. Feature sem linha cai no fallback do gateway.
- `campaign-wizard.tsx` (444 linhas): etapa 2 tem `msgMode` `'free'` ("Escrever agora") / `'template'`, `messageBody`, `messageOk`; criação via `useCreateCampaign` → `campaigns.service.createCampaign` → depois `dispatchCampaign`.
- `ai-copilot` é o exemplo de edge do Veltzy com JWT de usuário + `HubClient` (sem entrada no `config.toml`, ou seja, `verify_jwt` padrão true).

## O que entra / o que não entra
Entra: schema (Hub), catálogo de IA (Hub), edge `campaign-variants`, atribuição e render no dispatch, editor de versões no wizard.
Não entra: métricas por versão, template HSM, anti-ban, cadências/automações, tela de detalhe da campanha (segue mostrando `message_body`).

## Blocos e ordem entre repos
1. **B1 (Hub, codificadora do Hub):** migration abaixo no staging + regenerar tipos do Hub.
2. **B2 (Veltzy):** `_shared/campaign-variants.ts` (validação + atribuição, puras, com teste) + edge `campaign-variants` + `config.toml`. Deploy no staging.
3. **B3 (Veltzy):** `blast-dispatch` com versões. Deploy no staging.
4. **B4 (Veltzy):** editor de versões no wizard + service/hook + tipos.
B2, B3 e B4 dependem do B1. B4 depende do B2 (chama a edge).

## Arquivos
Hub (B1, fora do diff deste repo): `supabase/migrations/<ts>_veltzy_blast_message_variants.sql`.

<!-- arquivos -->
specs/campanha-variacoes-ia/PRD.md
specs/campanha-variacoes-ia/SPEC.md
supabase/config.toml
supabase/functions/_shared/campaign-variants.ts
supabase/functions/_shared/campaign-variants.test.ts
supabase/functions/campaign-variants/index.ts
supabase/functions/blast-dispatch/index.ts
src/types/database.ts
src/lib/campaign-variants.ts
src/lib/campaign-variants.test.ts
src/services/campaigns.service.ts
src/hooks/use-campaign-variants.ts
src/components/campanhas/campaign-variants-editor.tsx
src/components/campanhas/campaign-variants-editor.test.tsx
src/components/campanhas/campaign-wizard.tsx
<!-- /arquivos -->

## Migration (B1, SQL completo)

```sql
-- Variações da mensagem livre de campanha (IA) + índice da versão por destinatário.

-- 1. blast_campaigns.message_variants: array de strings, [0] = original. NULL = sem variação.
ALTER TABLE veltzy.blast_campaigns
  ADD COLUMN IF NOT EXISTS message_variants jsonb;

ALTER TABLE veltzy.blast_campaigns
  DROP CONSTRAINT IF EXISTS blast_campaigns_message_variants_check;
ALTER TABLE veltzy.blast_campaigns
  ADD CONSTRAINT blast_campaigns_message_variants_check CHECK (
    message_variants IS NULL OR (
      jsonb_typeof(message_variants) = 'array'
      AND jsonb_array_length(message_variants) BETWEEN 1 AND 5
    )
  );

COMMENT ON COLUMN veltzy.blast_campaigns.message_variants IS
  'Versões da mensagem livre (array de strings, [0] = original, 1 a 5). NULL = usa message_body.';

-- 2. blast_recipients.variant_index: qual versão o destinatário recebeu.
ALTER TABLE veltzy.blast_recipients
  ADD COLUMN IF NOT EXISTS variant_index smallint;

ALTER TABLE veltzy.blast_recipients
  DROP CONSTRAINT IF EXISTS blast_recipients_variant_index_check;
ALTER TABLE veltzy.blast_recipients
  ADD CONSTRAINT blast_recipients_variant_index_check CHECK (
    variant_index IS NULL OR variant_index BETWEEN 0 AND 4
  );

COMMENT ON COLUMN veltzy.blast_recipients.variant_index IS
  'Índice em blast_campaigns.message_variants da versão enviada. NULL = campanha sem variação.';

-- 3. Catálogo de IA: feature nova do Veltzy (sem linha, o gateway cai no fallback).
--    Provider/modelo são decisão do Hub; o default abaixo segue o das features de
--    completion do Veltzy (ai_copilot) e pode ser trocado no painel.
INSERT INTO public.ai_features (product, feature_key, label, description, kind, default_provider, default_model, is_active)
VALUES (
  'veltzy',
  'campaign_message_variants',
  'Variações de campanha',
  'Gera versões alternativas da mensagem livre de campanha, preservando as variáveis',
  'completion',
  'openai',
  'gpt-4.1-mini',
  true
)
ON CONFLICT (product, feature_key) DO NOTHING;
```

RLS: nenhuma policy nova. `blast_campaigns` e `blast_recipients` já têm RLS por `company_id`; as colunas herdam. `ai_features` não muda de policy.
Verificação (staging, SELECT): colunas existem; `select feature_key from public.ai_features where product='veltzy' and feature_key='campaign_message_variants'` = 1 linha.

## O que fazer em cada arquivo
### B2
- `_shared/campaign-variants.ts` (puro):
  - `extractVariables(text): string[]`: nomes de `{{ x }}` (case-insensitive, trim), únicos e ordenados.
  - `sameVariables(original, variant): boolean`: mesmo conjunto (nada a menos, nada a mais).
  - `validateVariant(original, variant): { ok: true } | { ok: false; reason: 'empty' | 'too_long' | 'missing_vars' | 'extra_vars' | 'duplicate' }`, com `existing: string[]` para recusar texto igual à original ou a outra versão (comparação normalizada: trim, espaços colapsados, minúsculas).
  - `assignVariants(n, k, rand = Math.random): number[]`: vetor de tamanho `n` com índices `0..k-1` em fatias iguais (diferença máxima 1 entre fatias; sobra distribuída a partir do índice 0), embaralhado por Fisher-Yates com `rand`. `k <= 1` → tudo 0.
  - Limites: `MAX_VARIANTS = 5`, `MAX_MESSAGE_LENGTH = 4096`.
- `_shared/campaign-variants.test.ts`: extração/validação (perde variável, inventa variável, caixa diferente, vazio, duplicada), atribuição (n=10,k=3 → contagens {4,3,3}; n<k; k=1; rand determinístico).
- `campaign-variants/index.ts`: POST `{ message: string, count: number, avoid?: string[] }`.
  - Auth: JWT do usuário (`verify_jwt = true` + `getUser`), `profiles.company_id`, papel admin/manager/super_admin (mesma regra do `blast-dispatch`).
  - Gates: `features.mkt_ativo_enabled === true` e `features.ai_msg_enabled === true` (403 com `reason`).
  - Valida `message` (não vazio, ≤ 4096) e `count` (1..4: quantas versões NOVAS).
  - Chama `HubClient.complete` com `feature: 'campaign_message_variants'`, uma tool `return_variants({ variants: string[] })`, prompt de sistema: reescrever a mensagem em pt-BR mantendo sentido, tom e tamanho aproximado, mudando a forma; copiar cada `{{variavel}}` exatamente como está, sem criar outras; sem markdown, sem aspas; não repetir textos de `avoid`.
  - Filtra com `validateVariant` (contra a original + `avoid` + as já aceitas). Faltou versão válida: até 2 novas chamadas pedindo só as que faltam. Responde `{ variants: string[], incomplete: boolean }`.
  - Erros do Hub: `LIMIT_EXCEEDED`/`TENANT_DISABLED` → 402/403 com mensagem de negócio; demais → 502.
- `supabase/config.toml`: `[functions.campaign-variants]` `verify_jwt = true`, com comentário.

### B3
- `blast-dispatch/index.ts`, só no ramo texto livre:
  - `variants = Array.isArray(campaign.message_variants) && campaign.message_variants.length > 1 ? campaign.message_variants : null`.
  - Com `variants`: cada item precisa ser string não vazia com `sameVariables(variants[0], v)`; senão 422 `reason: 'invalid_variants'` (defesa; o client já valida).
  - `variantIdx = assignVariants(audience.length, variants.length)`; `recipientRows[i].variant_index = variantIdx[i]`.
  - Depois do upsert, relê `blast_recipients (lead_id, variant_index)` da campanha e usa o índice gravado (o upsert com `ignoreDuplicates` mantém o de um disparo anterior); `content = renderMessageBody(variants[idx], lead)`. Índice gravado nulo ou fora do array cai no sorteado agora.
  - Sem `variants`: exatamente o fluxo atual (`variant_index` NULL).
  - `computeBlastSchedule` e anti-ban intocados.

### B4
- `src/types/database.ts`: `BlastCampaign.message_variants: string[] | null`; `BlastRecipient.variant_index: number | null`.
- `src/lib/campaign-variants.ts`: espelho client de `extractVariables`, `sameVariables`, `validateVariant` (mesma regra; o client não importa de `supabase/functions`). `src/lib/campaign-variants.test.ts` com os mesmos casos de validação.
- `campaigns.service.ts`: `CreateCampaignInput.message_variants?: string[] | null` gravado no insert; `generateCampaignVariants(message, count, avoid)` → `supabase.functions.invoke('campaign-variants')`.
- `src/hooks/use-campaign-variants.ts`: `useGenerateVariants()` (mutation) com toast de erro em linguagem de negócio.
- `src/components/campanhas/campaign-variants-editor.tsx` (novo, o wizard já passa de 400 linhas):
  - props: `original`, `value: VariantDraft[]`, `onChange`. `VariantDraft = { text: string; status: 'pending' | 'approved' }`.
  - Seletor "Quantas versões" (2 a 5, padrão 3) + botão "Gerar variações com IA" (gera `total - 1`).
  - Card da original: só leitura, marcado "Sua mensagem".
  - Card de cada versão: textarea editável; Aprovar / Descartar / Gerar outra (pede 1 com `avoid` = original + demais). Editar volta para pendente. Erro de variável em edição aparece no card ("Esta versão precisa ter {{nome}}" / "{{x}} não existe na mensagem original") e bloqueia o Aprovar.
  - Sem `ai_msg_enabled`: botão desabilitado com aviso "A geração com IA não está ativa para a sua empresa".
  - Textos sem jargão: "versões", "Sua mensagem", "Cada contato recebe uma das versões, sorteadas de forma equilibrada".
- `campaign-variants-editor.test.tsx`: Continuar bloqueado com pendente; Aprovar bloqueado com variável faltando.
- `campaign-wizard.tsx`: estado `variants: VariantDraft[]`; editor abaixo do textarea no modo "Escrever agora"; `messageOk` exige todas aprovadas quando há versões; mudar o texto original depois de gerar limpa as versões (aviso); `createCampaign` recebe `message_variants: [original, ...aprovadas]` só quando há ≥ 1 versão além da original, senão `null`; Revisão: "Mensagem: Texto livre · N versões".

## Contratos não óbvios
```ts
// POST /functions/v1/campaign-variants
type Req = { message: string; count: number /* 1..4 novas */; avoid?: string[] }
type Res = { variants: string[]; incomplete: boolean }
// erros: 400 (entrada), 401, 403 { reason: 'mkt_ativo_disabled' | 'ai_not_enabled' | 'forbidden' }, 402 { reason: 'limit_exceeded' }, 502

// blast_campaigns.message_variants
// [original, v1, v2, ...] | null ; message_body continua = original

// _shared/campaign-variants.ts
assignVariants(10, 3, rand) // ex.: [2,0,1,0,2,1,0,1,0,2] -> contagens {0:4, 1:3, 2:3}
```

## Critérios de aceite
- [ ] B1: colunas e CHECKs no staging; linha `campaign_message_variants` no `ai_features`.
- [ ] Edge devolve só versões que passam em `validateVariant`; com `count=2`, 2 versões (ou `incomplete: true` após as tentativas).
- [ ] Edge recusa usuário sem papel (403), empresa sem `mkt_ativo_enabled` ou `ai_msg_enabled` (403), mensagem vazia ou longa (400).
- [ ] Uso registrado no `ai_usage` com `feature = campaign_message_variants`.
- [ ] Dispatch com 3 versões e 10 leads: `variant_index` em todos os recipients, contagens 4/3/3, texto da fila = versão do índice renderizada.
- [ ] Dispatch com `message_variants` NULL ou com 1 item: igual a hoje, `variant_index` NULL.
- [ ] Dispatch com versão que perdeu variável: 422 `invalid_variants`, nada enfileirado.
- [ ] Wizard: gerar, editar, descartar, gerar outra; Continuar só com todas aprovadas; Revisão mostra o número de versões; mudar a original limpa as versões.
- [ ] Template (Cloud API) não mostra o editor.
- [ ] build, vitest, `deno test` dos `_shared` novos, `deno check` sem erro novo; edges no staging com `verify_jwt` conforme `config.toml`.

## Decisões tomadas
- (Copiloto) Só mensagem livre: template HSM é aprovado pela Meta e não pode variar.
- (Copiloto) Total de 2 a 5 versões, padrão 3, a original conta como uma.
- (Copiloto) Cada versão é editável, descartável e regenerável; Continuar só com todas aprovadas.
- (Copiloto) A IA preserva as variáveis da original; validado no servidor, versão que perde ou inventa variável é descartada e pedida de novo.
- (Copiloto) Distribuição balanceada aleatória: embaralha e reparte em fatias iguais, não sorteio independente por lead.
- (Copiloto) Anti-ban (intervalos, teto, janela) não muda.
- (Copiloto) Métricas por versão ficam para depois; o índice já é gravado.
- Feature registrada no catálogo `public.ai_features` (não em `ai_model_config`): o catálogo é a fonte por `(product, feature)` e tem precedência; sem a linha o gateway usa o fallback sem avisar. Provider/modelo propostos = default do `ai_copilot`; a escolha final é do Hub.
- `message_variants[0]` é sempre a original e `message_body` continua gravado com ela: telas que leem `message_body` (detalhe da campanha) seguem funcionando.
- `message_variants` só é gravado com 2+ itens; campanha sem versões grava NULL (um item só seria redundante com `message_body`). O CHECK aceita 1..5 para não travar dado legado ou manual.
- `variant_index` com CHECK 0..4, alinhado ao máximo de 5 versões.
- Gate `ai_msg_enabled` na edge (além de `mkt_ativo_enabled`): é o mesmo opt-in de custo que o passo "Gerar com IA" das cadências já usa.
- Papel exigido na edge = o do `blast-dispatch` (admin/manager/super_admin): quem não pode disparar campanha não gasta IA com ela.
- Saída da IA por tool (`return_variants`), não por texto livre: o gateway não repassa `response_format`.
- `count` na edge = versões novas (1..4), não o total: "Gerar outra" reusa a mesma chamada com `count=1` e `avoid`.
- Até 2 chamadas extras quando a IA devolve versão inválida; depois disso responde `incomplete: true` e o usuário usa "Gerar outra" (sem loop de custo).
- Versão igual à original ou a outra versão (normalizada) é recusada como `duplicate`.
- Dispatch revalida as variáveis das versões (defesa contra dado gravado fora do wizard) e falha inteiro com 422, sem enfileirar parte.
- A IA recebe só o texto da mensagem, nunca dado de lead (nada pessoal sai para o provedor).
- Validação duplicada em `src/lib/campaign-variants.ts`: o client não importa código de `supabase/functions`; os testes dos dois lados cobrem os mesmos casos.
- Editar uma versão volta para pendente: aprovação vale para o texto exato que vai sair.
- Mudar a mensagem original depois de gerar limpa as versões: elas derivam do texto anterior.
- Editor em componente próprio (`campaign-variants-editor.tsx`): o wizard já tem 444 linhas.
- Re-disparo (status `scheduled` ainda aceita dispatch): o texto enfileirado segue o `variant_index` já gravado no recipient, para o índice nunca divergir do que o lead recebeu.
