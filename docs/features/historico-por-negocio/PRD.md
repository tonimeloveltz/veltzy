# PRD: Histórico por negócio

> Feature: `historico-por-negocio` / Onda 1
> Status: Aprovado. Três decisões de produto fechadas em 11/08/2026 (D5, D6, D7)
> Data: 2026-08-11
> Continuação de: `docs/features/deal-refactor/` (RNF-02 e "Fase de limpeza")

---

## 1. Problema

O histórico de atividades nasce na tabela errada. Ele foi escrito quando contato e negócio eram a mesma linha, e ficou onde estava quando os dois se separaram.

Hoje, **mover um card no kanban de um contato que tem dois ou mais negócios não gera registro nenhum**. Não é falha intermitente nem erro de permissão: é silêncio por construção, e silêncio não tem sintoma. Ninguém abre a tela de logs e vê um erro; a linha simplesmente não existe, e quem olha conclui que ninguém mexeu.

No staging, **13 dos 34 contatos já têm dois ou mais negócios, ou seja 38%**. Para esse terço, o histórico comercial não existe.

**O que esta entrega resolve:** o histórico passa a nascer do negócio, que é a entidade que de fato se move, e volta a cobrir 100% dos contatos.

## 2. Estado atual, verificado no staging em 11/08/2026

A cadeia que gera um log hoje tem três elos, e o do meio tem uma trava:

1. O vendedor arrasta o card. `moveDealStage` (`deals.service.ts:127`) atualiza **só** `veltzy.deals`.
2. O trigger `trg_mirror_deal_to_lead` copia `stage_id`, `pipeline_id` e `value` do negócio para o contato.
3. O trigger `on_lead_activity` em `veltzy.leads` grava em `activity_logs`.

O elo 2 tem esta trava, e ela é **deliberada**:

```sql
-- Trava multi-deal: só espelha se este lead tem exatamente 1 deal.
-- Com 2+ deals (Fase 3), o espelho se cala e os leitores já terão
-- migrado para deals. Evita comportamento indefinido.
IF deal_count > 1 THEN
  RETURN NEW;
END IF;
```

Ela está certa: com N negócios num contato, não existe resposta correta para "qual etapa é a do contato". O autor preferiu o silêncio a um valor arbitrário.

O que ficou pela metade é a segunda frase do comentário. **Os leitores migraram** — o kanban lê `deals`. **O logging não migrou.**

Isso não é descoberta nova. O PRD do `deal-refactor` já pedia em RNF-02 "triggers de activity_logs adaptados para deals", e o inventário da Fase 0 registrou que `log_lead_activity` "segue funcionando, mas perde sentido se os campos saírem de leads — revisar na Fase de limpeza". A limpeza não aconteceu.

### 2.1 O que já foi corrigido, e não faz parte desta frente

A duplicata de dois logs para uma ação **já está resolvida no banco**. A `log_lead_activity` viva ganhou a condição `AND OLD.stage_id IS NOT DISTINCT FROM NEW.stage_id`, que só grava `status_changed` quando o status muda sozinho. Medição confirma: o último `status_changed` é de 03/08, e os `stage_changed` seguem até 10/08.

### 2.2 Arquivar não deixa rastro

`veltzy.deals` tem três triggers (`updated_at`, status won/lost, validação de pipeline) e **nenhum escreve em `activity_logs`**. Arquivar um negócio é `deals.service.ts:227`, um update em `deals`, que não passa perto do log.

### 2.3 A fonte de verdade é o repo do Hub, não `supabase/migrations/` daqui

Quatro peças que estão rodando no banco **não aparecem** em `supabase/migrations/` deste repositório:

| Item | Em `supabase/migrations/` do Veltzy | No banco |
|---|---|---|
| `trg_mirror_deal_to_lead` | ausente | existe |
| `mirror_deal_to_lead()` | ausente | existe |
| condição anti-duplicata em `log_lead_activity` | ausente | existe |
| nome do trigger de updated_at em leads | `on_leads_updated` | `on_updated` |

**Isso não é dívida nem descontrole: é o desenho.** As migrations do Central são escritas no repo do **Hub**, e as quatro peças acima estão versionadas lá. O que existe em `supabase/migrations/` aqui é cópia histórica, anterior à separação, mantida como arquivo e não como fonte.

**A consequência prática é o pré-requisito desta frente:** quem escrever a Spec lê o **Hub**, não este diretório. Uma Spec escrita a partir dos arquivos daqui descreveria uma `log_lead_activity` sem a condição anti-duplicata e proporia reintroduzir um defeito já resolvido, sem que nada no caminho avisasse.

O risco real desses arquivos é **contágio por cópia**: eles não são executados por ninguém, mas continuam servindo de molde para quem escreve SQL novo. Já aconteceu duas vezes nesta base — `public.set_updated_at()` e o `071_google_calendar_connections.sql`, que nasceu aqui por engano e precisa ser movido para o Hub.

## 3. Decisões de arquitetura (locked)

**D1. O log nasce em `deals`.** É a entidade que se move. Trigger novo em `veltzy.deals` cobrindo mudança de etapa, de status, de responsável e de valor.

**D2. A trava do espelho não se mexe.** Ela protege contra valor arbitrário no contato e continua necessária enquanto `leads.stage_id` existir. Esta frente a torna irrelevante para o histórico, não a remove.

**D3. `log_lead_activity` para de gravar o eco do espelho, mas só na segunda etapa.** Revisada duas vezes em 11/08/2026:

1. Dizia "`stage_changed` e `status_changed` saem de lá". Remover criaria ponto cego, porque `bulkMoveToPipeline` (`leads.service.ts:275`) escreve `leads.stage_id` direto e sem log próprio. O que sai é só o **eco**, distinguido por `pg_trigger_depth()`.
2. E não sai agora. Decisão da Leticia: **primeiro entra o log em deals, valida, depois tira o de leads.** A Onda 1 fica puramente aditiva.

O preço é duplicata temporária para contato com um negócio só. Ver Spec 1.2 e 1.2.1.

**D8. A trilha de auditoria é mantida na exclusão.** Decisão da Leticia em 11/08/2026: não entra trigger que apague logs de negócio excluído. A tensão com LGPD fica registrada, e o caminho que atende os dois lados — anonimizar o metadata em vez de apagar a linha — vira frente própria quando houver primeiro pedido de titular. Ver Spec 1.3 e pendência 2.

**D4. A migration vai no repo do Hub.** O Veltzy consome o schema do Central, não é dono (`docs/AMBIENTES.md:28-30`).

**D5. O histórico é do negócio.** Um contato com três negócios tem três históricos. A visão por contato, se existir, é composição dos históricos dos negócios dele, não uma lista própria. Decidido pela Leticia em 11/08/2026.

**D6. Os logs antigos ficam onde estão, por enquanto.** As 65 linhas com `resource_type='lead'` não são migradas nem descartadas nesta onda. Decidido pela Leticia em 11/08/2026.

**D7. Arquivar é mudança de status, não evento próprio.** Não se cria vocabulário novo. Arquivar já é `deals.status = 'archived'`; ele não aparece no histórico hoje apenas porque `veltzy.deals` não tem trigger de log. Assim que o trigger da D1 cobrir mudança de status, arquivar passa a registrar sozinho, sem tratamento especial. Decidido pela Leticia em 11/08/2026.

## 4. O que a D6 cobra do resto do sistema

Deixar os logs antigos quietos é a decisão barata agora e tem um preço que aparece depois, então fica escrito:

- **Os dois `resource_type` convivem por tempo indeterminado**, não durante uma transição. A UI (`activity-logs-dashboard.tsx`) precisa ler `'lead'` e `'deal'` como estado permanente, e qualquer filtro ou agrupamento por entidade tem que contar com os dois.
- **Eventos anteriores ao split só existem no formato antigo.** Uma timeline por negócio, quando vier (Onda 3), começa vazia para todo negócio criado antes desta onda, porque o passado dele está pendurado no contato.
- **A conta some se alguém apagar por engano.** Os 65 registros são o único histórico pré-split que existe. Não há de onde reconstruir.

Nada disso bloqueia a Onda 1. É dívida consciente, e a decisão de quitá-la ou não é a Onda 2.

## 5. Fluxo

**Hoje:** vendedor move card → deals atualiza → espelho se cala se houver 2+ negócios → nenhum log.

**Depois:** vendedor move card → deals atualiza → trigger em deals grava o log, sempre, independente de quantos negócios o contato tenha.

## 6. Modelo de dados

`veltzy.activity_logs` não muda de schema. Passa a receber linhas com `resource_type='deal'` e `resource_id` do negócio.

Por causa da D6, a UI (`activity-logs-dashboard.tsx`, hoje em Admin > Logs avançados) precisa ler os dois `resource_type` **como estado permanente**, não como transição.

Arquivar não ganha `action` própria (D7): entra como `status_changed` com `to_status = 'archived'` no metadata. A tradução para o vendedor é problema de rótulo na UI, que já tem o mapa em `activity-logs-dashboard.tsx:7-11`.

## 7. LGPD

**Não há tratamento novo de dado pessoal.** Os campos registrados são de negócio: etapa, status, valor, responsável. Nome e telefone do contato já são gravados hoje no evento `created` e continuam iguais.

O que muda é **retenção**: o log passa a apontar para `deals`, e `activity_logs.resource_id` não tem FK. Apagar um contato leva junto os negócios dele, mas **não** leva os logs.

Pela D8 isso é intencional: auditoria vale mais, agora, do que a limpeza automática. A tensão é real e fica registrada — o metadata do `created` de negócio carrega `name`, e o de contato carrega nome e telefone, então há dado pessoal sobrevivendo ao registro que o originava.

O caminho que atende auditoria e titular ao mesmo tempo é **anonimizar o metadata na exclusão**, preservando a linha e o evento. Não é desta onda, e o gatilho para abri-la é o primeiro pedido de exclusão de titular.

## 8. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Spec escrita a partir de `supabase/migrations/` do Veltzy, reintroduzindo a duplicata já corrigida | Alto | A Spec parte do repo do **Hub**, que é a fonte. Os arquivos daqui são cópia histórica (2.3) |
| Log duplicado de novo, agora entre trigger de deals e o de leads | Médio | D3 tira as responsabilidades migradas de `log_lead_activity` na mesma migration que cria o trigger novo |
| Timeline quebrada durante a transição, com metade dos eventos em cada formato | Médio | Resposta da Q2 antes de escrever a Spec |
| Migration aplicada sem policy ou sem grant | Alto | Precedente recente e documentado: `docs/features/cadastro-produtos/Spec-onda1.md:1.1` |

## 9. Ondas

**Onda 1 (esta).** Trigger de log em `deals` cobrindo etapa, status, responsável e valor. Arquivar passa a registrar por consequência, sem código próprio (D7). A aba Histórico do pipeline passa a mostrar o histórico do negócio. `log_lead_activity` **não muda** (D3), então a onda é aditiva.

**Onda 1.5.** Tirar o eco de `log_lead_activity`, depois de a Onda 1 estar validada no staging.

**Onda 2, sem data.** Destino dos 65 logs antigos. Adiada pela D6, não cancelada. O gatilho para reabrir é alguém precisar de timeline contínua num negócio anterior ao split.

**Onda 3.** ~~Timeline por negócio na UI.~~ **Antecipada para a Onda 1** em 11/08/2026: a aba Histórico do pipeline passa a ser do negócio já nesta entrega, porque o modal já recebe `dealId` e o service já aceita o tipo de recurso. Ver Spec 2.1.

O que sobra de Onda 3 é a visão por contato como composição dos históricos dos negócios dele (D5), que não tem tela hoje.

## 10. Métricas de sucesso

- Contatos com 2+ negócios que passam a ter histórico: hoje 0%, meta 100%.
- Arquivamentos com registro: hoje 0%.
- Logs por ação do usuário: deve ser exatamente 1, medido por amostragem depois da entrega.

## 11. Fora de escopo

Remover a trava do espelho. Remover `leads.stage_id` e `leads.deal_value`. Timeline por negócio na UI (Onda 3). Renomear "lead" para "contato" (segue como Fase 3 do `deal-refactor`). Logs de mensagens e de tarefas, que têm caminho próprio.
