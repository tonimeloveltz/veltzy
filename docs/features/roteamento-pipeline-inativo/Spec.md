# Spec: Roteamento ignora pipeline desativado

> **Onde:** `supabase/functions/_shared/resolve-pipeline-by-origin.ts`
> **Status:** Implementada, aguardando deploy e teste no staging
> **Migration:** NENHUMA.
> **Base:** branch `develop`. Branch própria (`fix/roteamento-pipeline-inativo`,
> com `--no-track`), separada da `fix/pipelines-desativados`, que é só frontend.
> **Origem:** achado da seção 8 de `docs/features/reativar-pipeline/Spec.md`.

---

## 1. PROBLEMA

`resolvePipelineByOrigin` decide em qual pipeline cai o negócio novo que chega
por WhatsApp (Z-API, Evolution, WAHA, Cloud API) ou por webhook de origem. Ela
busca as regras de `pipeline_routing_rules` com `is_active = true` e escolhe a
mais específica (`pickByWeight`). Confere o `is_active` da **regra**, mas não o
do **pipeline de destino**.

Desativar um pipeline não mexe nas regras dele. Uma regra ativa apontando para
um pipeline desativado continua mandando negócio para lá, onde ele não aparece
no kanban nem no seletor. Ninguém atende.

O fallback (`resolveDefaultPipeline`) já filtra `pipelines.is_active`. Só o
caminho por regra está aberto.

**Situação atual (produção, 28/09/2026):** zero regras ativas apontando para
pipeline inativo e zero negócios dentro de pipeline inativo. O defeito nunca
disparou. A correção é preventiva.

## 2. DECISÃO

Corrigir no **resolver**, não na desativação.

- No resolver, protege qualquer caminho: pipeline desativado antes desta
  correção, desativado por SQL, ou por uma tela futura.
- Bloquear a desativação enquanto houver regra obrigaria o admin a caçar regras
  em outra tela, e não protege o que já está no banco.

Regra de comportamento: **regra cujo pipeline está inativo não existe para o
roteamento.** O resolver segue para a próxima regra que casar, pela ordem de
peso de sempre, e se nenhuma sobrar cai no padrão ativo. Reativar o pipeline
devolve a regra ao jogo sem nenhuma ação extra, o que combina com a reativação
recém-implementada.

## 3. ESCOPO

**Entra:**
1. `RoutingRule` ganha `pipeline_is_active: boolean`.
2. A query de regras em `resolvePipelineByOrigin` traz o `is_active` do pipeline
   pelo embed da FK.
3. `pickByWeight` ignora regra com `pipeline_is_active = false`, do mesmo jeito
   que já ignora `is_active = false`.
4. Testes Deno novos em `resolve-pipeline-by-origin.test.ts`.

**Não entra (não implementar):**
- Desativar, apagar ou mover regras ao desativar o pipeline. A regra fica
  intacta no banco e volta a valer se o pipeline for reativado.
- Bloquear a desativação por existir regra.
- Aviso na tela de regras. A regra de pipeline inativo não aparece no admin
  (a tela lista por pipeline ativo), mas o fluxo que já existe cobre o único
  atrito: ao cadastrar a mesma origem em outro pipeline, a unique por
  empresa+origem faz `getRoutingRuleByOrigin` achar a regra antiga e oferecer
  "Mover para este funil?". Mover reatribui e resolve.
- Log de "regra ignorada por pipeline inativo". `pickByWeight` é pura; logar
  exigiria duplicar o casamento no resolver. Se a falta fizer falta, vira pendência.
- Qualquer mudança em `resolveDefaultPipeline`, em `lead-inbound-handler.ts` ou
  nas edge functions que o chamam.

## 4. IMPLEMENTAÇÃO

### 4.1 Tipo

```ts
export interface RoutingRule {
  id: string
  pipeline_id: string
  match_type: MatchType
  match_value: string
  is_active: boolean
  pipeline_is_active: boolean // is_active do pipeline de destino
}
```

### 4.2 `pickByWeight`

No `filter`, acrescentar a condição:

```ts
r.is_active &&
r.pipeline_is_active &&
candidates.some(...)
```

Nada mais muda na função.

### 4.3 Query em `resolvePipelineByOrigin`

Trazer o pipeline pelo embed da FK `pipeline_routing_rules.pipeline_id` e
mapear para o campo plano. **Não** usar `.eq('pipelines.is_active', true)` no
PostgREST: o filtro fica em `pickByWeight`, onde é testado.

```ts
const { data: rows, error } = await supabase
  .from('pipeline_routing_rules')
  .select('id, pipeline_id, match_type, match_value, is_active, pipelines:pipeline_id(is_active)')
  .eq('company_id', companyId)
  .eq('is_active', true)

// Embed to-one: tipado como array, mas em runtime vem objeto (FK unica).
// Mesmo cuidado de `getRoutingRuleByOrigin` no front.
const rules: RoutingRule[] = (rows ?? []).map((row: Record<string, unknown>) => {
  const embed = row.pipelines as { is_active: boolean } | { is_active: boolean }[] | null
  const pipeline = Array.isArray(embed) ? embed[0] : embed
  return {
    id: row.id as string,
    pipeline_id: row.pipeline_id as string,
    match_type: row.match_type as MatchType,
    match_value: row.match_value as string,
    is_active: row.is_active as boolean,
    // Sem embed (nao deveria acontecer: FK NOT NULL com CASCADE) conta como
    // inativo: melhor cair no padrao do que num pipeline que nao se enxerga.
    pipeline_is_active: pipeline?.is_active === true,
  }
})
```

O `console.error` de erro da query continua como está; com erro, `rules` fica
vazio e cai no padrão, como hoje.

### 4.4 Testes (`resolve-pipeline-by-origin.test.ts`)

- O helper `rule()` passa a ter `pipeline_is_active: true` no default, para os
  testes existentes seguirem valendo sem edição.
- Novos:
  1. **Regra mais específica com pipeline inativo cede para a próxima.** `ad_id`
     casando para `p-desativado` (`pipeline_is_active: false`) e `instance`
     casando para `p-ativo`. Esperado: `p-ativo`.
  2. **Única regra que casa aponta para pipeline inativo.** Esperado: `null`
     (o resolver cai no padrão).
  3. **Regra ativa e pipeline inativo não é o mesmo que regra inativa.** Mesma
     montagem do teste existente "regra inativa e ignorada", trocando
     `is_active: false` por `pipeline_is_active: false`. Esperado: `p-ativa`.

## 5. DEPLOY

Esta mudança só vale depois do deploy de cada edge function que empacota o
arquivo. Hoje são **cinco**, todas pelo `handleInboundMessage`:

`zapi-webhook`, `evolution-inbound`, `waha-inbound`, `cloud-api-inbound`,
`source-webhook`.

Conferir a lista antes do deploy (`grep -rln "lead-inbound-handler" supabase/functions/*/index.ts`),
porque função nova pode ter entrado. Deploy no staging primeiro. Produção só
depois do merge na `main`, com OK explícito no passo.

## 6. CRITÉRIOS DE ACEITE

**Automáticos:**
1. `npx --yes deno test supabase/functions/_shared/resolve-pipeline-by-origin.test.ts`:
   todos passam, os antigos e os três novos. Transcrever a saída.
2. `npx --yes deno check` nas cinco functions da seção 5, **sem erro novo**.
   Em 28/09/2026 as cinco já falhavam na `develop` (2fe3377) antes desta mudança:
   8 erros em cada inbound e 21 no `source-webhook`, todos de tipagem do client
   `veltzy` passado como `SupabaseClient<..., "public">` em
   `lead-inbound-handler.ts` e `source-webhook/index.ts`. A contagem é a mesma
   antes e depois, e nenhum erro cita o resolver. Dívida separada.
3. `npm run lint` sem erro novo em relação ao merge-base (o lint cobre
   `supabase/functions`; tsc e build não).

**No staging, depois do deploy:**

Atenção: **não** usar o "Pipeline de Testes" da empresa Veltz Demonstração. Ele
recebe inbound real da sessão WAHA `stark-tech-solucoes` pela regra
`c6b3535c-...`, e tem negócios, então nem dá para desativar.

4. Numa empresa de teste, criar o pipeline `Rota Teste` (vazio), uma origem de
   webhook e uma regra `webhook_source` dessa origem para `Rota Teste`. Disparar
   um lead pelo webhook: o negócio cai em `Rota Teste` (controle: a regra funciona).
5. Mover esse negócio para outro pipeline, desativar `Rota Teste` e disparar
   outro lead pela mesma origem. O negócio cai no **pipeline padrão** e aparece
   no kanban.
6. Reativar `Rota Teste` pela seção "Desativados" e disparar um terceiro lead.
   O negócio volta a cair em `Rota Teste`, sem mexer na regra.
7. Rodar de novo `regras-orfas.sql`. Com `Rota Teste` desativado, a query 1 lista
   a regra (esperado, ela fica no banco) e a query 2 volta **vazia**.

## 7. PVO

1. Os três automáticos da seção 6, com saída transcrita.
2. `git diff --stat` mostrando só `resolve-pipeline-by-origin.ts` e
   `resolve-pipeline-by-origin.test.ts`.
3. Critérios 4 a 7 no staging.
