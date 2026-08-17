# Spec: Histórico por negócio, Onda 1

> Feature: `historico-por-negocio` / Onda 1
> PRD: `docs/features/historico-por-negocio/PRD.md`
> Status: Pronta para implementação
> Data: 2026-08-11
> Fonte consultada: repo do **Hub** (`../hub`), baseline e `20260805110000_fix_log_lead_activity_status_echo.sql`

---

## 0. Resumo

O histórico passa a nascer em `veltzy.deals`. Uma migration no Hub cria o trigger de log em deals. No Veltzy muda **uma linha**: um rótulo novo na tela de logs.

**A onda é puramente aditiva.** Nenhuma função existente é alterada, nada é apagado. Tirar o eco de `log_lead_activity` fica para uma segunda etapa, depois de a primeira estar validada (1.2.1), e a trilha de auditoria na exclusão é mantida (1.3).

O preço dessa ordem é duplicata temporária para contato com um negócio só. É intencional, está no passo 1 da verificação, e some na segunda etapa.

O grosso desta onda é SQL, e ela só tem valor depois de aplicada no staging.

## 1. Migration, no repo do HUB

Arquivo novo em `supabase/migrations/` do **Hub**, nome no padrão de lá: `YYYYMMDDHHMMSS_log_deal_activity.sql`. Nunca em `supabase/migrations/` do Veltzy, que é cópia histórica (PRD 2.3).

### 1.1 Trigger de log em deals

```sql
CREATE OR REPLACE FUNCTION "veltzy"."log_deal_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'veltzy', 'public'
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
        VALUES (NEW.company_id, auth.uid(), 'created', 'deal', NEW.id,
            jsonb_build_object('name', NEW.name, 'value', NEW.value,
                               'stage_id', NEW.stage_id, 'lead_id', NEW.lead_id));

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'stage_changed', 'deal', NEW.id,
                jsonb_build_object('from_stage', OLD.stage_id, 'to_stage', NEW.stage_id,
                                   'lead_id', NEW.lead_id));
        END IF;

        -- Mesmo motivo da 20260805110000 em leads: set_deal_status_on_stage_change e
        -- BEFORE UPDATE e deriva o status do stage. Sem esta condicao, mover para uma
        -- etapa final gravaria stage_changed E status_changed para uma acao so.
        -- O status_changed solo (arquivar, fechar direto) continua sendo gravado.
        IF OLD.status IS DISTINCT FROM NEW.status
           AND OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'status_changed', 'deal', NEW.id,
                jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status,
                                   'lead_id', NEW.lead_id));
        END IF;

        IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'assigned', 'deal', NEW.id,
                jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to,
                                   'lead_id', NEW.lead_id));
        END IF;

        -- Valor NAO e derivado do stage. Mudar valor e mover na mesma operacao sao
        -- dois fatos distintos e geram dois logs de proposito. Nao e duplicata.
        IF OLD.value IS DISTINCT FROM NEW.value THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'value_changed', 'deal', NEW.id,
                jsonb_build_object('from_value', OLD.value, 'to_value', NEW.value,
                                   'lead_id', NEW.lead_id));
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_log_deal_activity" ON "veltzy"."deals";
CREATE TRIGGER "trg_log_deal_activity"
  AFTER INSERT OR UPDATE ON "veltzy"."deals"
  FOR EACH ROW EXECUTE FUNCTION "veltzy"."log_deal_activity"();
```

`lead_id` vai no metadata de todos os eventos de propósito: é o que permite montar a visão por contato da D5 sem uma segunda consulta.

`auth.uid()` é `NULL` quando quem move é uma edge function com service role (`run-automations`, distribuição de fila). Isso é correto e significa "sistema"; a UI precisa saber exibir assim em vez de deixar em branco.

### 1.2 `log_lead_activity` **não muda nesta onda**

Decisão da Leticia em 11/08/2026: entra o que soma, depois se tira o que sobra. A onda é **puramente aditiva** — nenhuma função existente é alterada, então o pior caso de um rollback é apagar um trigger novo.

**Consequência esperada e aceita: contato com 1 negócio passa a gerar 2 logs por ação**, um com `resource_type='deal'` (novo) e um com `'lead'` (o de sempre, via espelho). Isso **não é defeito** enquanto esta etapa durar, e o passo 1 da verificação existe para confirmar que é exatamente isso que acontece, nem mais nem menos.

Contato com 2+ negócios não duplica: o espelho já se cala para eles, então sai só o log de deals — que é justamente o que hoje não existe.

### 1.2.1 Segunda etapa, depois de a 1.1 estar validada

Quando os passos da 4.2 fecharem, uma **segunda migration** tira o eco de `log_lead_activity`. Registrado aqui para não se perder, e para deixar claro o que **não** fazer:

```sql
-- Nos ramos stage_changed e status_changed de veltzy.log_lead_activity,
-- acrescentar a condicao:
AND pg_trigger_depth() = 1
```

- UPDATE direto em `leads` (bulk move, edge function, admin) → profundidade 1 → **grava**, como hoje.
- UPDATE vindo de `trg_mirror_deal_to_lead` → profundidade 2 → **não grava**, porque `trg_log_deal_activity` já registrou.

**Não é para remover os ramos.** Remover cria ponto cego: `bulkMoveToPipeline` (`leads.service.ts:275`) escreve `leads.stage_id` direto, em lote, sem log próprio, e ficaria sem histórico. É a correção da D3 do PRD, que dizia "remover".

> Quando escrever essa migration, reproduza o corpo inteiro da função a partir da versão vigente do **Hub** (`20260805110000_fix_log_lead_activity_status_echo.sql`), acrescentando só as duas condições. **Não** reescreva a partir do `033` do Veltzy, que não tem a correção anti-eco.

### 1.3 Auditoria na exclusão: mantida, sem trigger de limpeza

Decisão da Leticia em 11/08/2026: **manter a trilha de auditoria.** Não entra trigger de purge. Apagar um negócio não apaga o histórico dele.

O que isso deixa em aberto, escrito para não virar surpresa: `activity_logs.resource_id` não tem FK, então sobra linha apontando para negócio que não existe mais, e o metadata do `created` carrega `name`, que costuma ser o nome do contato. Sob LGPD isso é dado pessoal que sobrevive à exclusão do registro que o originava.

O caminho que atende os dois lados, se um dia for preciso, é **anonimizar o metadata em vez de apagar a linha** — o evento continua auditável, o nome sai. É migration própria e não faz parte desta onda. Fica na seção 6.

## 2. Frontend

### 2.1 A aba Histórico do pipeline passa a ser do negócio

Decisão da Leticia em 11/08/2026, que **traz para esta onda** o que o PRD tinha deixado para a Onda 3. Cabe aqui porque o modal já tem tudo de que precisa.

Hoje `edit-lead-modal.tsx:537` renderiza `<LeadTimeline leadId={lead.id} />`, e o hook `useLeadActivityLogs` (`use-activity-logs.ts:14`) chama `getActivityLogsByResource(companyId, 'lead', leadId)` com o tipo **fixo em `'lead'`**.

O que muda:

- **`use-activity-logs.ts`**: hook novo, irmão do que existe.
  ```ts
  export const useDealActivityLogs = (dealId: string | undefined) => {
    const companyId = useAuthStore((s) => s.company?.id)
    return useQuery({
      queryKey: ['activity-logs', 'deal', dealId],
      queryFn: () => getActivityLogsByResource(companyId!, 'deal', dealId!),
      enabled: !!companyId && !!dealId,
    })
  }
  ```
  `activity-logs.service.ts:15` já recebe `resourceType` como parâmetro. **Service não muda.**

- **`edit-lead-modal.tsx`**: `LeadTimeline` (inline, `:610`) vira `DealTimeline`, **extraído para `src/components/pipeline/deal-timeline.tsx`** junto com `actionConfig` e `formatActivityLabel`. O modal tem 760 linhas contra o limite de ~200 do `CLAUDE.md:67`; deixar inline pioraria isso.

  **A prop é `activeDeal?.id`, não `dealId` cru.** O modal deriva `activeDeal = dealId ? deals?.find(...) : deals?.[0]` (`:76`), e `deals.tsx:493` monta o `EditLeadModal` **sem** passar `dealId`. Com `dealId` cru, a aba Histórico da tela de Negócios nasceria sempre vazia enquanto o resto do modal fala do `deals[0]`. Com `activeDeal?.id`, a aba fala do mesmo negócio que as outras abas, nos dois pontos de entrada. Correção da codificadora em 12/08/2026, verificada.

- **`actionConfig` (`:584`)**: rótulos para o vocabulário novo.
  ```ts
  value_changed: { icon: DollarSign, label: 'Valor alterado para' },
  ```
  E `created` passa de "Lead criado" para "Negócio criado", porque agora é o evento do negócio.

  **Traduzir também os status.** `formatActivityLabel` imprime `meta.to_status` cru, então arquivar renderiza "Status alterado para **archived**". Isso já acontece hoje com logs de contato, mas a D7 transforma o arquivamento de caso raro em rotina, e o inglês passa a ser o que o vendedor lê todo dia. Mapa de cinco chaves, sobre os valores do CHECK de `deals.status`:

  ```ts
  const statusLabels: Record<string, string> = {
    open: 'aberto', won: 'ganho', lost: 'perdido',
    archived: 'arquivado', pending_assignment: 'aguardando responsável',
  }
  ```

  Achado da codificadora em 12/08/2026, fora da Spec original. Entra porque é copy de tela que nasceria quebrada na mesma entrega que a torna visível.

### 2.2 O histórico anterior aparece na mesma aba, abaixo e separado

Decisão da Leticia em 11/08/2026: em vez de só avisar que existe histórico antigo, **mostrá-lo**.

Pela D6 os logs antigos ficam pendurados no contato, então sem isto todo negócio anterior a esta onda abriria a aba vazia, com anos de histórico existindo e não aparecendo.

**A aba passa a ter dois blocos, nesta ordem:**

1. **Histórico deste negócio** — `resource_type='deal'`, `resource_id=dealId`. É o formato definitivo.
2. **Contato** — `resource_type='lead'`, `resource_id=leadId`, cortado pelo primeiro log do negócio (abaixo). Separado por um divisor com a palavra "Contato".

Blocos separados, e não uma lista única intercalada, por dois motivos: a ordem cronológica já os separa naturalmente (tudo do bloco 2 é mais antigo que tudo do bloco 1), e misturar afirmaria que eventos do contato pertencem a este negócio — o que é falso justamente para contato com vários negócios, onde o log antigo pode ser de outro.

**O divisor é o único sinal de origem.** A versão anterior desta Spec pedia também um rótulo em cada linha; a Leticia removeu em 12/08/2026, deixando só o divisor. As linhas dos dois blocos ficam visualmente idênticas, então o divisor carrega sozinho a informação de que aquilo é do contato. Isso é suficiente enquanto ele estiver visível — se o bloco 2 crescer a ponto de o divisor sair da área de scroll (`max-h-[40vh]`), torná-lo sticky resolve. Não é necessário agora.

#### O corte, derivado do dado e não de uma data

**A fronteira é o log mais antigo deste negócio.** Entram no bloco 2 os logs de contato anteriores a ele. Se o negócio ainda não tem log nenhum, entra o histórico do contato inteiro.

```ts
// Os logs vem ordenados por created_at DESC, entao o mais antigo e o ultimo.
const corte = dealLogs?.length
  ? new Date(dealLogs[dealLogs.length - 1].created_at)
  : null

const anteriores = (leadLogs ?? []).filter(
  (l) => !corte || new Date(l.created_at) < corte
)
```

**Por que isso é suficiente:** o eco só passa a existir no instante em que o trigger da 1.1 começa a gravar. Logo, todo log de contato anterior ao **primeiro** log do negócio é necessariamente anterior ao trigger, e não pode ser eco. O corte se ajusta sozinho, negócio a negócio.

**Por que não é uma data fixa.** A versão anterior desta Spec usava uma constante com a data da aplicação. Está errada: a constante é uma só, o código é o mesmo em staging e em produção, e as duas aplicações têm datas diferentes — a Leticia aplica no staging, o Toni promove depois. Qualquer valor único fica errado em um dos dois ambientes, escondendo histórico legítimo em produção ou mostrando eco duplicado em staging. Corrigido em 12/08/2026, a pedido da Leticia.

O ganho colateral é que **a entrega deixa de depender da aplicação da migration**: não há valor a preencher depois, e o frontend pode ir junto.

Depois da Onda 1.5, quando o eco parar, sobra a pergunta que já estava aberta: eventos diretos no contato (bulk move, edge function) posteriores ao primeiro log do negócio ficam fora desta aba. **Não decidir isso agora** — é produto e depende de a Onda 1.5 existir.

#### Quando os dois blocos estiverem vazios

Aí sim a frase, e ela continua sendo mais honesta que "Nenhuma atividade registrada ainda":

> Nenhuma atividade registrada para este negócio.

#### O que isso cobra do hook

`useLeadActivityLogs` **continua existindo e sendo usado** — é ele que alimenta o bloco 2. O `useDealActivityLogs` da 2.1 alimenta o bloco 1. A aba consulta os dois, e o filtro por data é aplicado no cliente, sobre o retorno do primeiro.

### 2.3 Painel de administrador

**`src/components/admin/activity-logs-dashboard.tsx`**, no mapa de `:6-12`:

```ts
value_changed: 'Mudou valor',
```

Só isso. A tela já imprime `log.resource_type` cru e já cai no `?? log.action` para ação desconhecida, então lê `'deal'` e `'lead'` sem alteração. É view de administrador, não de vendedor.

### 2.4 O que a duplicata temporária faz aqui

Enquanto a 1.2 durar, contato com um negócio grava log de `deal` **e** de `lead` para a mesma ação. Na aba isso **não** aparece, porque o bloco 1 só lê `'deal'` e o bloco 2 corta pelo log mais antigo do negócio (2.2). Para o vendedor, a aba já nasce no formato final.

A duplicata fica visível apenas no painel de administrador, que lista tudo sem filtro — e lá é aceitável, porque é ferramenta de diagnóstico e o `resource_type` aparece em cada linha.

**Isso torna o corte parte da correção, não enfeite.** Se ele falhar, o defeito não aparece como erro: aparece como movimento repetido, que o vendedor lê como "o sistema registrou duas vezes" ou, pior, "alguém moveu duas vezes".

## 3. Arquivos afetados

**No Hub (1):** a migration da seção 1.

**No Veltzy (3):** `use-activity-logs.ts` (hook novo), `edit-lead-modal.tsx` (timeline por negócio, rótulos e vazio), `activity-logs-dashboard.tsx` (um rótulo).

`activity-logs.service.ts` **não muda**: ele já recebe `resourceType` como parâmetro. Nenhum componente do kanban muda.

## 4. Verificação

### 4.1 Automática, no Veltzy

```bash
npx tsc --noEmit
npm run lint      # baseline salvo em arquivo, fora do repo, contra origin/develop
npm run build
npm test
```

Ela prova quase nada nesta onda: a mudança de frontend é um rótulo. **O que vale é a 4.2.**

### 4.2 Manual, no staging, depois de aplicar a migration

Rode cada passo e confira com:

```sql
SELECT action, resource_type, metadata, created_at
FROM veltzy.activity_logs
ORDER BY created_at DESC LIMIT 10;
```

1. **Mover card de contato com 1 negócio.** **2** logs, um `resource_type='deal'` e um `'lead'`, ambos `stage_changed`. **É o esperado nesta etapa** (1.2): o de deals é novo, o de lead é o de sempre. Se vier só o de `'lead'`, o trigger novo não está ativo. Some na segunda etapa (1.2.1).
2. **Mover card de contato com 2+ negócios.** Exatamente **1** log, `resource_type='deal'`. Sem duplicata aqui, porque o espelho já se cala para multi-deal. Hoje são zero, e é para isto que a frente existe.
3. **Mover para etapa final** (fechado ou perdido). Nenhum `status_changed`, só `stage_changed` — 2 deles nesta etapa, pelo mesmo motivo do passo 1. Se aparecer `status_changed` com `resource_type='deal'`, a condição anti-eco da 1.1 está errada.
4. **Arquivar um negócio.** **1** log, `status_changed`, `to_status='archived'` (D7). Hoje são zero.
5. **Mudar o valor e mover na mesma ação** (diálogo de valor da etapa de proposta). **2** logs, `stage_changed` e `value_changed`. **Isso é correto**, são dois fatos.
6. **Trocar o responsável.** `assigned`.
7. **Criar negócio.** `created`.
8. **Mover contatos em lote para outro pipeline** (`bulkMoveToPipeline`). Continua gerando log com `resource_type='lead'`. Nesta etapa é só linha de base; ele vira o passo decisivo na segunda etapa (1.2.1), que é quando pode virar ponto cego.
9. **Rodar uma automação que move deal** (`run-automations`). O log nasce com `user_id NULL`. Confirmar que a tela não quebra.

### 4.2.1 A aba Histórico, no navegador

10. **Abrir um negócio movido depois da migration.** A aba Histórico mostra os eventos **daquele negócio**, com etapa de destino pelo nome, e não os do contato.
11. **Contato com 2+ negócios: abrir dois deles.** Cada aba mostra o histórico do seu, sem misturar. Este é o passo que prova a D5, e é impossível de obter hoje.
12. **Abrir um negócio antigo, anterior à migration.** O bloco "Antes da separação" aparece com os eventos do contato, cada linha marcada como do contato. O bloco de cima vem vazio até o negócio se mover pela primeira vez.
13. **O passo que o corte decide: contato com 1 negócio, mover o card, abrir a aba.** O movimento aparece **uma vez só**, no bloco de cima. Se aparecer também no bloco de baixo, o corte da 2.2 não está filtrando o eco do espelho.

    Repita **movendo uma segunda vez**: o corte é o log **mais antigo** do negócio, então o segundo movimento também precisa ficar fora do bloco de baixo. Um corte implementado com o log mais **recente** passaria no primeiro teste e falharia neste.
14. **Contato com 2+ negócios, abrir dois.** O bloco de cima difere entre eles. O de baixo **pode diferir em comprimento**, e isso é correto: cada negócio corta no próprio primeiro log, então um que começou a registrar mais tarde mostra mais histórico de contato que o irmão. Diferem sempre que houver evento direto no contato (bulk move, edge function) entre o primeiro log de um e o do outro.

    **O critério de aprovação não é igualdade entre os dois**, é: nenhum bloco de baixo repete um movimento que já está no bloco de cima **daquele** negócio. Ajustado em 12/08/2026 pela codificadora, ao notar que o corte derivado invalidou o critério anterior.

    Consequência conceitual, e ela é a favor: com o corte derivado, o bloco de baixo não é "o histórico do contato", é "o histórico do contato **antes deste negócio começar a registrar**". É por negócio por construção — e é por isso que o divisor "Contato" precisa estar visível ao olhar para aquelas linhas, já que elas são idênticas às do bloco de cima.
15. **Mudar o valor pelo diálogo da etapa de proposta.** Aparece "Valor alterado para", com o valor novo. Sem o rótulo, cai no `?? log.action` e o vendedor lê `value_changed`.

### 4.3 Não regressão

16. O espelho continua funcionando para contato com 1 negócio: mover o card ainda atualiza `leads.stage_id`.
17. Os 65 logs antigos com `resource_type='lead'` continuam existindo, aparecendo no painel de administrador e agora também no bloco inferior da aba (2.2). Nenhum deles se perde de vista.
18. Kanban, tela de Negócios e Contatos seguem iguais. Nada mais de leitura muda.

## 5. Fora de escopo

Timeline por negócio na UI (Onda 3). Destino dos logs antigos (Onda 2). Remover a trava do espelho. Remover `leads.stage_id`. Transformar `bulkMoveToPipeline` em operação sobre deals. Logs de mensagens e de tarefas.

## 6. Pendências

1. **`bulkMoveToPipeline` move contatos, não negócios** (`leads.service.ts:275`). É a última operação de produto que ainda trata o contato como se fosse o negócio. Ela funciona, e o log dela sobrevive por causa da 1.2, mas é incoerente com o resto e devia virar operação sobre deals. Frente própria.
2. **Apagar um contato ou um negócio não apaga os logs dele**, por decisão de manter auditoria (1.3). Sobra dado pessoal sem finalidade: o metadata do `created` de negócio tem `name`, e o de contato tem nome **e telefone**. O caminho que atende auditoria e LGPD ao mesmo tempo é **anonimizar o metadata** na exclusão, preservando a linha e o evento. Vale abrir quando houver primeiro pedido de exclusão de titular, e é migration pequena.
3. **`veltzy.activity_logs` não tem índice por `resource_id`.** Hoje ninguém consulta por recurso, mas a timeline da Onda 3 vai consultar, e sem índice ela degrada. Barato de adicionar junto com a Onda 3, caro de descobrir depois.
