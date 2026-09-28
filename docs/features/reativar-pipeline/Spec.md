# Spec: Reativar pipeline desativado

> **Tela:** Admin > aba Pipeline (`src/components/admin/pipeline-list-manager.tsx`)
> **Status:** Implementada, aguardando teste no browser
> **Migration:** NENHUMA. Esta Spec não toca em `supabase/`.
> **Branch:** `fix/pipelines-desativados` (a partir da `develop`, 110c446)

---

## 1. PROBLEMA

"Excluir" um pipeline só faz `is_active = false` (`pipelines.service.ts:94`,
soft delete definido na Spec de múltiplos pipelines). Dois defeitos nascem disso:

1. **Não há como reativar.** `getPipelines` filtra `is_active = true`, então o
   pipeline desativado some da interface e só volta pelo banco.
2. **O nome fica preso para sempre.** A constraint `pipelines_company_id_slug_key`
   é `UNIQUE (company_id, slug)` e vale também para os inativos (baseline do Hub,
   linha 4577). O slug sai do nome (`slugify`, `pipeline-list-manager.tsx:25`).
   Criar um pipeline com o nome de um desativado estoura 23505, e o toast mostra a
   mensagem crua do Postgres (`duplicate key value violates unique constraint ...`).
   O mesmo acontece ao **renomear** um pipeline ativo para esse nome (`handleBlur`).

## 2. ESTADO DO BANCO (conferido na baseline do Hub, não nas migrations do Veltzy)

- `vz_pip_select` libera SELECT de todos os pipelines da empresa, sem filtro de
  `is_active`. `vz_pip_all` libera escrita para admin da empresa. Admin já
  consegue listar e reativar inativos; **não precisa de policy nova**.
- Nada é apagado ao desativar: etapas (`pipeline_stages`), agente SDR
  (`agent_profiles`), origens (`pipeline_sources`), acesso por usuário
  (`user_pipeline_access`) e regras de roteamento continuam no banco. Reativar
  devolve tudo como estava.
- Um pipeline só é desativado se tiver **zero negócios** (guard em
  `deletePipeline`), e o padrão não pode ser desativado (o botão some). Logo, todo
  inativo tem `is_default = false`.

## 3. ESCOPO

**Entra:**
1. Seção "Desativados (N)" no card de Pipelines, recolhida por padrão, com botão
   Reativar por linha.
2. Ao criar um pipeline cujo slug bate com o de um **inativo**, perguntar se quer
   reativar em vez de dar erro.
3. Mensagem legível para 23505 ao criar e ao renomear.
4. Texto do confirm de desativação passa a avisar que dá para reativar.

**Não entra (não implementar):**
- DELETE de verdade (hard delete). `sdr_conversations.pipeline_id` não tem
  `ON DELETE` e bloquearia; é outra discussão.
- Índice único parcial (`WHERE is_active`) ou qualquer migration.
- Renomear o slug ao desativar.
- Reativar com nome novo. Depois de reativado, o admin renomeia inline como já faz.
- Refatorar `pipeline-list-manager.tsx` (já está em 230 linhas). A lógica nova vai
  em componentes novos; o arquivo existente recebe só a ligação.
- O achado da seção 8.

## 4. SERVICE (`src/services/pipelines.service.ts`)

### 4.1 `getInactivePipelines(companyId)`

```ts
export const getInactivePipelines = async (companyId: string): Promise<Pipeline[]> => {
  const { data, error } = await veltzy()
    .from('pipelines')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', false)
    .order('name')
  if (error) throw error
  return data
}
```

### 4.2 `reactivatePipeline(companyId, pipelineId)`

- Posição: final da lista de ativos (`max(position) + 1`). A posição antiga pode
  colidir com a de outro pipeline criado depois. Extrair o cálculo que já existe
  em `createPipeline` (linhas 42-51) para um helper local `getNextPosition(companyId)`
  e usar nos dois lugares, sem mudar o comportamento de `createPipeline`.
- UPDATE com `.eq('company_id', companyId)` e `.eq('is_active', false)` e
  `.select().single()`. **Conferir a linha devolvida**: se o RLS barrar ou o
  pipeline já estiver ativo, o update não aceita linha nenhuma e não dá erro. Nesse
  caso lançar `new Error('Não foi possível reativar o pipeline')`.

```ts
export const reactivatePipeline = async (companyId: string, pipelineId: string): Promise<Pipeline> => {
  const position = await getNextPosition(companyId)
  const { data, error } = await veltzy()
    .from('pipelines')
    .update({ is_active: true, position })
    .eq('id', pipelineId)
    .eq('company_id', companyId)
    .eq('is_active', false)
    .select()
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Não foi possível reativar o pipeline')
  return data
}
```

### 4.3 23505 legível em `createPipeline` e `updatePipeline`

Onde hoje está `if (error) throw error` logo após o insert/update de `pipelines`:

```ts
if (error?.code === '23505') {
  throw new Error('Já existe um pipeline com esse nome. Se ele estiver desativado, reative em "Desativados".')
}
if (error) throw error
```

No `createPipeline`, só no insert do pipeline, não no insert das etapas.

### 4.4 `deletePipeline`

Não muda.

## 5. HOOKS (`src/hooks/use-pipelines.ts`)

O arquivo já reúne todos os hooks de pipeline; seguir o padrão dele.

- `useInactivePipelines()`: `queryKey: ['pipelines', companyId, 'inactive']`.
  Como começa com `['pipelines']`, as invalidações que já existem (criar,
  desativar, reordenar) atualizam a lista de inativos sem código extra.
- `useReactivatePipeline()`: `mutationFn: (pipelineId) => reactivatePipeline(...)`;
  `onSuccess` invalida `['pipelines']` **e** `['pipeline-deal-counts']`, toast
  `'Pipeline reativado'`; `onError` toast com `err.message`, fallback
  `'Erro ao reativar pipeline'`.

## 6. UI

### 6.1 `src/components/admin/inactive-pipelines-section.tsx` (novo)

Props: `pipelines: Pipeline[]`, `onReactivated: (id: string) => void`.

- `pipelines.length === 0` → não renderiza nada.
- Botão de texto `Desativados (N)` com `ChevronRight`/`ChevronDown` (lucide),
  `text-xs text-muted-foreground`, abre e fecha com `useState(false)`.
- Aberto: uma linha por pipeline com a barrinha de cor (mesma do
  `SortablePipelineRow`: `h-6 w-1 rounded-full`, `style={{ backgroundColor }}`), o
  nome em `text-xs text-muted-foreground` e um `Button variant="ghost" size="sm"`
  "Reativar" com `RotateCcw`. Sem drag, sem edição inline.
- Clicar Reativar: chama `useReactivatePipeline` direto, sem confirmação (a ação é
  reversível). Botão com `Loader2` enquanto `isPending` daquela linha. Em sucesso,
  `onReactivated(id)`.
- Cores só por token. A cor do pipeline é dado do usuário, por isso vai em `style`,
  igual ao componente existente.

### 6.2 `src/components/admin/reactivate-pipeline-dialog.tsx` (novo)

`AlertDialog` (`@/components/ui/alert-dialog`, mesmo padrão de
`src/components/deals/bulk-unarchive-dialog.tsx`).

Props: `pipeline: Pipeline | null`, `onClose`, `onConfirm`, `isPending` (mesma
forma do `BulkUnarchiveDialog`).

- Título: `Pipeline desativado`
- Texto: `Já existe um pipeline desativado chamado "{nome}". Quer reativá-lo? As etapas e configurações dele voltam como estavam.`
- Ações: `Cancelar` e `Reativar` (com `Loader2` em `isPending`).

### 6.3 Ligação em `pipeline-list-manager.tsx`

1. `const { data: inactivePipelines } = useInactivePipelines()` e
   `const reactivatePipeline = useReactivatePipeline()`.
2. Estado `const [conflict, setConflict] = useState<Pipeline | null>(null)`.
3. `handleAdd`: antes do `mutateAsync`, procurar em `inactivePipelines` um item com
   `slug === slugify(newName)`. Se achar, `setConflict(item)` e retornar sem criar.
   Se a lista estiver desatualizada, o insert estoura 23505 e cai na mensagem da
   4.3, que é o fallback aceitável.
4. Confirmar no dialog: `reactivatePipeline.mutateAsync(conflict.id)`, depois
   `setConflict(null)`, `setNewName('')`, `onSelectPipeline(conflict.id)`, igual ao
   fim do fluxo de criação.
5. Renderizar `<InactivePipelinesSection>` logo abaixo da linha de criação, dentro
   do `CardContent`, com `onReactivated={onSelectPipeline}`.
6. Confirm de desativação (linha 112): trocar o texto para
   `` `Desativar "${pipeline.name}"? Você pode reativar depois em "Desativados".` ``

**Rename com erro:** hoje, se o update falha, o input continua com o nome
rejeitado e parece salvo. No `handleBlur` do `SortablePipelineRow`, passar
`onError: () => setName(pipeline.name)` no `mutate` para o campo voltar ao nome
real. É uma linha e faz parte do defeito 2.

## 7. CRITÉRIOS DE ACEITE (teste no browser, staging)

Preparação: uma empresa com pelo menos dois pipelines ativos e um pipeline vazio
chamado `Teste Reativar`.

1. Desativar `Teste Reativar`. O confirm cita "Desativados". A linha some e aparece
   `Desativados (1)` abaixo da criação, recolhido.
2. Empresa sem nenhum inativo: a seção **não aparece**.
3. Abrir `Desativados`, clicar Reativar. Toast `Pipeline reativado`, o pipeline
   volta para o **fim** da lista de ativos, fica selecionado e as etapas dele
   aparecem no editor de etapas iguais às de antes.
4. Desativar de novo e digitar `teste reativar` (minúsculo) no campo de novo
   pipeline. Abre o dialog com o nome `Teste Reativar`. **Cancelar** não cria nada
   e não reativa nada.
5. Repetir o 4 e confirmar. O pipeline volta ativo com o nome antigo, o campo de
   novo pipeline limpa e **não** existe um segundo pipeline com esse nome.
6. Com `Teste Reativar` desativado, renomear outro pipeline ativo para
   `Teste Reativar`. Toast com a mensagem da 4.3 (nada de `duplicate key`) e o
   input volta ao nome anterior.
7. Criar um pipeline com o nome de um **ativo** (ex.: o nome do padrão). Toast
   com a mensagem da 4.3.
8. Kanban e seletor de pipeline: o reativado aparece nos dois sem recarregar a
   página.
9. Logado como vendedor (não admin), a seção `Desativados` não é acessível (a aba
   admin já é restrita; confirmar que nada novo vazou para outra tela).

## 8. ACHADO FORA DO ESCOPO (reportar, não corrigir)

`resolvePipelineByOrigin` (`supabase/functions/_shared/resolve-pipeline-by-origin.ts:109`)
filtra `pipeline_routing_rules.is_active`, mas **não** o `is_active` do pipeline de
destino. Uma regra de roteamento apontando para um pipeline desativado continua
mandando negócio novo para lá, onde ninguém vê. Desativar não mexe nas regras. Vale
uma Spec própria: ou o resolver ignora regra de pipeline inativo e cai no padrão,
ou a desativação é bloqueada enquanto houver regra ativa apontando para ele.

## 9. PVO

1. `npx tsc -b` sem erro (`tsc --noEmit` não checa nada neste tsconfig).
2. `npm run build` sem erro.
3. `npm run lint` sem erro novo em relação ao merge-base.
4. `git diff --stat` mostrando só: `pipelines.service.ts`, `use-pipelines.ts`,
   `pipeline-list-manager.tsx` e os dois componentes novos. Nada em `supabase/`.
5. Critérios da seção 7 no browser.
