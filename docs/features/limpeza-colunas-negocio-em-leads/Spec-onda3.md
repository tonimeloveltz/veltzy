# Spec: Limpeza das colunas de negócio em `leads`, Onda 3

> Feature: `limpeza-colunas-negocio-em-leads` / Onda 3 (o drop)
> PRD: `docs/features/limpeza-colunas-negocio-em-leads/PRD.md`
> Ondas anteriores: `Spec-onda1.md` (mergeada 13/08), `Spec-onda2.md` (mergeada 14/08)
> Status: Pronta para implementação. **Só a migration é entregável; não há código de app.**
> Data: 2026-08-14
> Fonte: repo do **Hub** e inventário levantado no banco em 14/08/2026 (seção 1)

---

## 0. Resumo

`veltzy.leads` perde `stage_id`, `status` e `deal_value`. Uma migration, no repo do **Hub**.

**Esta onda é irreversível e não tem rollback.** As duas anteriores eram código, e reverter era um `git revert`. Aqui o dado some. O único caminho de volta é o backup da seção 3.

O maior risco não é o drop em si: é que **plpgsql não valida referência de coluna até executar**. Quatro funções mencionam essas colunas no corpo e nenhuma delas impede o `DROP COLUMN`. Se saírem antes, o drop passa limpo e o estrago só aparece no próximo `UPDATE` em `leads`, que é o inbox marcando conversa como lida, a atribuição de vendedor, a temperatura. Por isso as funções vêm primeiro e a verificação pós-drop (6.2) é obrigatória.

## 1. Inventário, medido nos dois bancos em 14/08/2026

Levantado com `pg_trigger`, `pg_proc.prosrc`, `pg_depend` e `pg_policies`. Views, rules e policies: **nada** referencia as três colunas, nos dois ambientes.

**Triggers em `veltzy.leads`** (idênticos nos dois):

| Trigger | Função | Destino |
|---|---|---|
| `on_lead_activity` | `log_lead_activity` | função reescrita (2.1) |
| `on_lead_stage_changed` | `sync_lead_status_from_stage` | **dropado** (2.2) |
| `on_updated` | `handle_updated_at` | intocado |

**Funções que citam as colunas** (idênticas nos dois):

| Função | Uso | Destino |
|---|---|---|
| `log_lead_activity` | lê `OLD/NEW.stage_id` e `.status` | reescrita, sem os ramos (2.1) |
| `sync_lead_status_from_stage` | lê `stage_id`, escreve `status` | drop (2.2) |
| `mirror_deal_to_lead` | escreve as três | reescrita, só `pipeline_id` (2.3) |
| `check_stage_has_leads` | lê `leads.stage_id` | reescrita, conta negócios (2.4) |
| `set_deal_status_on_stage_change` | `deals.stage_id` | **não tocar** |
| `validate_deal_stage_pipeline` | `deals.stage_id` | **não tocar** |

As duas últimas são falso positivo da busca textual: operam sobre `deals`, que tem coluna de mesmo nome.

**A `check_stage_has_leads` foi a surpresa do levantamento.** Ela não aparece em nenhuma Spec anterior: é um guard **no banco** (`BEFORE DELETE ON veltzy.pipeline_stages`) que duplica o guard de aplicação que a Onda 2 migrou para negócios. Ela ficou contando contatos pela coluna espelhada.

## 2. As quatro funções, antes do drop

### 2.1 `log_lead_activity` perde os ramos de etapa e status

Ela hoje grava `stage_changed` e `status_changed` a partir de `leads`. Depois do drop não há de onde ler, e os dois eventos já nascem em `deals` desde a Onda 1 do `historico-por-negocio` (`trg_log_deal_activity`).

Sobram `created` e `assigned`, que são eventos de contato de verdade.

```sql
CREATE OR REPLACE FUNCTION "veltzy"."log_lead_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'veltzy', 'public'
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
        VALUES (NEW.company_id, auth.uid(), 'created', 'lead', NEW.id,
            jsonb_build_object('name', NEW.name, 'phone', NEW.phone));
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            INSERT INTO veltzy.activity_logs (company_id, user_id, action, resource_type, resource_id, metadata)
            VALUES (NEW.company_id, auth.uid(), 'assigned', 'lead', NEW.id,
                jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
```

**Isto substitui a Onda 1.5 do `historico-por-negocio`**, e não é a versão que aquela Spec desenhava. Ela propunha acrescentar `pg_trigger_depth() = 1` para calar o eco preservando os ramos, porque `bulkMoveToPipeline` escreveria `leads.stage_id` direto e ficaria sem histórico. **Essa premissa caiu na Onda 2**: aquela função era código inalcançável e foi removida. Sem escrita direta, não há ponto cego, e condicionar por profundidade seria complexidade sem propósito, além de referenciar colunas que não vão existir.

### 2.2 `sync_lead_status_from_stage` e o trigger somem

Ela existe só para derivar `leads.status` de `leads.stage_id`. As duas colunas somem; ela não tem o que fazer.

```sql
DROP TRIGGER IF EXISTS "on_lead_stage_changed" ON "veltzy"."leads";
DROP FUNCTION IF EXISTS "veltzy"."sync_lead_status_from_stage"();
```

O trigger vai **antes** da coluna de propósito: `BEFORE UPDATE OF stage_id` cria dependência registrada, então o `DROP COLUMN` exigiria `CASCADE`. Dropar explicitamente é melhor que confiar em cascata, que derrubaria em silêncio o que mais dependesse.

### 2.3 `mirror_deal_to_lead` passa a espelhar só `pipeline_id`

Ela **não** pode ser dropada nesta onda: `leads.pipeline_id` continua existindo até a Onda 4, é `NOT NULL`, e ainda alimenta os sete filtros do dashboard. Dropar o espelho agora congelaria o valor no que foi gravado na criação, e o dashboard passaria a filtrar por pipeline errado sem sintoma.

```sql
CREATE OR REPLACE FUNCTION "veltzy"."mirror_deal_to_lead"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'veltzy', 'public'
    AS $$
DECLARE
  deal_count integer;
BEGIN
  -- Trava multi-deal preservada: com 2+ negocios nao existe resposta correta
  -- para "qual pipeline e o do contato", e o silencio e melhor que um valor
  -- arbitrario. Morre junto com a coluna, na Onda 4.
  SELECT count(*) INTO deal_count
  FROM veltzy.deals
  WHERE lead_id = NEW.lead_id;

  IF deal_count > 1 THEN
    RETURN NEW;
  END IF;

  UPDATE veltzy.leads l
  SET pipeline_id = NEW.pipeline_id
  WHERE l.id = NEW.lead_id
    AND NEW.pipeline_id IS NOT NULL
    AND l.pipeline_id IS DISTINCT FROM NEW.pipeline_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_mirror_deal_to_lead" ON "veltzy"."deals";
CREATE TRIGGER "trg_mirror_deal_to_lead"
  AFTER INSERT OR UPDATE OF "pipeline_id" ON "veltzy"."deals"
  FOR EACH ROW EXECUTE FUNCTION "veltzy"."mirror_deal_to_lead"();
```

**A cláusula `NEW.pipeline_id IS NOT NULL` é correção, não cópia.** `deals.pipeline_id` é nullable (`ON DELETE SET NULL`) e `leads.pipeline_id` é `NOT NULL`: a versão atual tentaria gravar `NULL` numa coluna que não aceita, e o `UPDATE` no negócio falharia. Hoje isso está latente porque os inserts sempre preenchem o pipeline; com o `UPDATE OF pipeline_id` no trigger, o caminho fica mais fácil de alcançar.

O trigger também estreita de `OF stage_id, pipeline_id, value` para `OF pipeline_id`, já que os outros dois destinos deixaram de existir.

### 2.4 `check_stage_has_leads` passa a contar negócios

```sql
CREATE OR REPLACE FUNCTION "veltzy"."check_stage_has_leads"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM veltzy.deals
    WHERE stage_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'Não é possível excluir uma etapa que contém negócios.';
  END IF;
  RETURN OLD;
END;
$$;
```

**O nome fica errado de propósito.** Renomear exigiria recriar o trigger e não muda comportamento; o custo de um nome desatualizado é menor que o de mexer em mais um objeto numa migration irreversível. Fica na pendência 1.

**A acentuação da mensagem é preservada da versão viva.** Corrigido em 14/08/2026, no review: a primeira versão desta Spec escreveu a mensagem sem acento, por efeito de o documento ser redigido assim, e isso teria degradado copy que o vendedor lê. Muda só a palavra `leads` para `negócios`.

Ganho colateral: o guard passa a concordar com o da aplicação (`pipeline.service.ts`, desde a Onda 2). Hoje eles divergem, e para os 23 contatos com etapa divergente o banco pode barrar a exclusão de uma etapa que não tem negócio nenhum.

## 3. Backup, antes de tudo

```sql
CREATE TABLE veltzy.leads_col_backup_20260814 AS
SELECT id, company_id, stage_id, status::text, deal_value
FROM veltzy.leads;
```

**Só a chave e as colunas que somem.** Não copiar `name`, `phone`, `email`: o backup existe para reconstituir três colunas, não para duplicar a base de contatos. Copiar dado pessoal que ninguém vai usar seria criar retenção nova sem finalidade, e é justamente o que a seção 7 do PRD pede para evitar.

`status::text` porque o enum `veltzy.lead_status` também some (4.2), e uma coluna de tipo inexistente tornaria o backup inútil.

**Prazo de descarte: 90 dias.** Passado esse tempo, se nada precisou ser reconstituído, `DROP TABLE`. Sem prazo, tabela de backup vira retenção indefinida por acidente.

## 4. O drop

### 4.1 Colunas

```sql
ALTER TABLE "veltzy"."leads"
  DROP COLUMN "stage_id",
  DROP COLUMN "status",
  DROP COLUMN "deal_value";
```

O índice `idx_veltzy_leads_company_stage` cai junto, por depender de `stage_id`. **`idx_leads_pipeline` fica**: é da Onda 4.

### 4.2 O enum

```sql
DROP TYPE IF EXISTS "veltzy"."lead_status";
```

Depois da coluna, nunca antes. Se algum objeto não inventariado ainda usar o tipo, este comando falha e a migration inteira reverte, que é o comportamento desejado: melhor falhar aqui do que deixar tipo órfão.

### 4.3 Ordem, e ela não é negociável

1. Backup (3)
2. `log_lead_activity` reescrita (2.1)
3. `check_stage_has_leads` reescrita (2.4)
4. `mirror_deal_to_lead` reescrita e trigger recriado (2.3)
5. `DROP TRIGGER on_lead_stage_changed` e `DROP FUNCTION sync_lead_status_from_stage` (2.2)
6. `DROP COLUMN` das três (4.1)
7. `DROP TYPE lead_status` (4.2)

Passos 2 a 4 antes do 6 porque plpgsql não valida coluna até executar: invertido, o drop passaria e o sistema quebraria depois, com o dado já perdido.

**Sobre a transação, e isto muda como a migration deve ser aplicada.** O arquivo **não** traz `BEGIN`/`COMMIT` explícito, seguindo a convenção do Hub, onde nenhuma migration usa. O motivo não é só convenção: `supabase db push` já envolve cada arquivo numa transação, e um `COMMIT` no meio do arquivo **encerraria essa transação antecipadamente**, deixando o restante fora dela. A linha que pareceria blindar é a que quebraria a atomicidade.

A consequência é que a atomicidade depende de **como** se aplica:

- **Via `supabase db push`:** transação garantida pelo CLI. É o caminho preferido.
- **Colado no SQL Editor:** não há transação nenhuma, e uma falha no meio deixa o banco em estado parcial, que é exatamente o cenário que a ordem acima existe para evitar. Quem aplicar assim **precisa envolver manualmente em `BEGIN` e `COMMIT`**.

Achado da codificadora em 14/08/2026, ao notar que seguir a convenção deixava essa armadilha aberta.

## 5. Ordenação entre ambientes, e ela é o risco de produção

Medido em 14/08/2026, em `pg_trigger` sobre `veltzy.deals`:

| Trigger | Staging | Produção |
|---|---|---|
| `trg_log_deal_activity` | **existe** | **não existe** |
| `trg_deal_status_on_stage_change` | existe | existe |
| `trg_mirror_deal_to_lead` | existe | existe |
| `trg_validate_deal_stage_pipeline` | existe | existe |
| `set_deals_updated_at` | existe | existe |

A Onda 1 do `historico-por-negocio` está no staging e **não foi promovida**.

**Consequência:** a 2.1 tira de `log_lead_activity` os eventos de etapa e status. No staging eles continuam existindo, porque `trg_log_deal_activity` os grava a partir de `deals`. Em produção **não existe quem os grave**. Aplicar esta onda lá antes de promover a outra frente deixa produção sem nenhum registro de mudança de etapa, e sem sintoma: nada dá erro, as linhas simplesmente param de aparecer.

**Pré-requisito absoluto:** `trg_log_deal_activity` tem que existir em produção antes desta migration ser aplicada lá. A verificação está em 6.1, passo 3.

## 6. Verificação

### 6.1 Antes de aplicar, no ambiente alvo

1. Ondas 1 e 2 do código em produção. `grep -rn "stage_id\|deal_value\|LeadStatus" src/ supabase/functions/` não pode achar leitura de contato (as exceções conhecidas estão na Spec da Onda 2, 4.1).
2. Rodar de novo as duas queries de inventário da seção 1. **Se aparecer função que não está na tabela, pare** e me chame: o levantamento é de 14/08 e o banco pode ter mudado.
3. **`trg_log_deal_activity` existe neste ambiente?** Se não, pare (seção 5).
4. Backup criado e com contagem conferida contra `SELECT count(*) FROM veltzy.leads`.

### 6.2 Depois de aplicar, e o primeiro passo é o que pega a armadilha

5. **`UPDATE veltzy.leads SET temperature = temperature WHERE id = '<um id real>';`** Tem que funcionar. Este é o passo que revela função plpgsql com referência órfã, e é o motivo de a ordem da 4.3 existir. Se falhar, a migration passou mas o sistema está quebrado.
6. Abrir o **inbox** e marcar uma conversa como lida. É `UPDATE` em `leads` pelo caminho real, com RLS e usuário de verdade.
7. Abrir **Contatos**. A lista carrega (o select já não pedia as colunas desde a Onda 2, mas confirma).
8. **Excluir uma etapa que tem negócio.** Tem que bloquear, com a mensagem nova citando negócios (2.4).
9. **Excluir uma etapa vazia.** Tem que funcionar. Se o guard novo estiver errado, ele barra aqui sem motivo.
10. **Mover um negócio de etapa** e conferir em `activity_logs` que sai **um** log, `resource_type='deal'`. A duplicata que a Onda 1 do histórico aceitou como temporária termina aqui.
11. **Trocar o responsável de um contato** e conferir que ainda gera `assigned` com `resource_type='lead'` (2.1 preserva esse ramo).
12. **Mover um negócio para outro pipeline** e conferir que `leads.pipeline_id` acompanha (2.3), para contato com um negócio só.

## 7. LGPD

O tratamento **diminui**: três colunas de dado de negócio deixam de ser duplicadas sobre o titular, o que atende o princípio de necessidade (art. 6º, III). Nenhuma delas é dado pessoal.

O ponto de atenção é o backup da seção 3, e ele foi desenhado para não virar problema: só `id`, `company_id` e as três colunas, sem nome, telefone ou email, com prazo de descarte de 90 dias. Um `SELECT *` ali teria criado uma cópia integral da base de contatos sem finalidade definida.

O histórico em `activity_logs` não é tocado. Os eventos de etapa e status já gravados continuam existindo, e a D8 do `historico-por-negocio` (manter a trilha na exclusão) segue valendo sem alteração.

## 8. Fora de escopo

`pipeline_id`, o índice `idx_leads_pipeline`, a `mirror_deal_to_lead` inteira e os sete filtros do dashboard: tudo Onda 4. Renomear `check_stage_has_leads`. A pendência da Fase vazia no modal (Onda 2, pendência 4). Os três `conversation_status` inválidos do copiloto e as duas pendências de erro engolido do `HubClient` e do `ai-complete`.

## 9. Pendências

1. **`check_stage_has_leads` fica com nome errado**, contando negócios. Renomear é migration própria, barata, e só vale junto de outra mudança na mesma tabela.

2. **`veltzy.activity_logs` continua sem índice por `resource_id`.** Herdada da Onda 1 do histórico (pendência 3 de lá). Depois desta onda a timeline por negócio é a única fonte de histórico de etapa, então a consulta por recurso deixa de ser hipótese.

3. **A Onda 4 herda uma decisão de produto**, registrada na seção 4 do PRD: o dashboard mede contatos ou negócios? Sem responder isso, `pipeline_id` não sai, e enquanto ela não sair a `mirror_deal_to_lead` e a trava multi-deal continuam de pé.
