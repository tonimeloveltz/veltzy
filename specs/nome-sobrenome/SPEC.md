# SPEC: Nome e sobrenome do lead

Trilha: G
Início: 2026-11-03 15:40
Merge: 2026-11-03 16:13

## Contexto
- `veltzy.leads.name` é o único campo de nome. Triggers atuais: `on_lead_activity` (AFTER INSERT OR UPDATE, `veltzy.log_lead_activity`, só loga criação e troca de `assigned_to`) e `on_updated` (BEFORE UPDATE, `veltzy.handle_updated_at`).
- Render de mensagem livre: `supabase/functions/_shared/blast-render.ts`, `renderMessageBody` + `FREE_VAR_MAP`. Template posicional: `renderTemplateBody`/`resolveTemplateParams` com `variable_mapping` `lead.<campo>`.
- `blast-dispatch` já busca o lead com `select('*')` (linha ~159): first/last chegam sem mudar o select.
- `process-cadences`: `send_message` grava `cfg.content` cru na `message_queue` (bug, `{{nome}}` vaza). O select do lead (linha ~70) é `id, phone, name, tags, marketing_opt_out, whatsapp_instance_name`: sem `company_name`, então `lead.company_name` em `send_template` de cadência hoje sai vazio (corrigido junto).
- Os outros executores de cadência (`process-recurring-cadences`, `start-cadences`, `process-blast-followups`, `cadence-webhook`) só criam `cadence_runs`; quem envia é só o `process-cadences`.
- Pontos de escrita de nome no client:
  - criação: `new-contact-modal.tsx` → `useCreateContact` → `leadsService.createLead`;
  - edição: `new-contact-modal.tsx` (modo edição), `edit-lead-modal.tsx`, `contact-panel.tsx` → `useUpdateLead` → `leadsService.updateLead`;
  - import: `import-leads.service.ts` + `csv-parser.ts` (`AUTO_MAP`, `LeadField`, `LEAD_FIELD_LABELS`).
  - `new-deal-modal.tsx` só seleciona contato existente, não cria lead.
- `contact-panel.tsx` recebe o lead da RPC `get_conversation_list` (colunas explícitas, sem first/last). `useLeadDetail(lead.id)` (`select('*')`) já existe e é reaproveitado para semear Nome/Sobrenome.
- `src/types/database.ts` é mantido à mão (não é saída do `gen types`).

## O que entra / o que não entra
Entra: colunas + trigger + backfill (Hub), render de variáveis, fix de cadência, formulários, import, tipos.
Não entra: writers automáticos (edge functions), exibição do nome no app, RPC `get_conversation_list`, capitalização de nomes.

## Blocos e ordem entre repos
1. **B1 (Hub, codificadora do Hub):** migration abaixo no staging, via `apply_migration` do MCP staging (ou CLI depois do preflight do Hub), arquivo `hub/supabase/migrations/<ts>_veltzy_leads_first_last_name.sql`.
2. **B2 (Veltzy, depende do B1):** tipos + render + cadência + campanha.
3. **B3 (Veltzy, depende do B1):** formulários + import.
B2 e B3 podem rodar em sequência na mesma branch `feature/nome-sobrenome`.
4. **B4 (Veltzy, fix achado no B3):** painel do contato no inbox apagando campos que a RPC da lista não traz. Ver seção "B4: causa raiz".

## Arquivos
Hub (B1, fora do diff deste repo): `supabase/migrations/<ts>_veltzy_leads_first_last_name.sql`.

<!-- arquivos -->
specs/nome-sobrenome/PRD.md
specs/nome-sobrenome/SPEC.md
src/types/database.ts
supabase/functions/_shared/blast-render.ts
supabase/functions/_shared/blast-render.test.ts
supabase/functions/process-cadences/index.ts
src/components/campanhas/campaign-wizard.tsx
src/components/cadencias/cadence-form.tsx
src/services/leads.service.ts
src/components/contacts/new-contact-modal.tsx
src/components/pipeline/edit-lead-modal.tsx
src/components/pipeline/edit-lead-modal.test.tsx
src/components/inbox/contact-panel.tsx
src/components/inbox/contact-panel.test.ts
src/lib/contact-panel-payload.ts
src/lib/csv-parser.ts
src/lib/csv-parser.test.ts
src/services/import-leads.service.ts
src/services/import-leads.test.ts
<!-- /arquivos -->

## Migration (B1, SQL completo)

```sql
-- veltzy.leads: first_name / last_name derivados de name (name segue canônico).

-- 1. Colunas
ALTER TABLE veltzy.leads
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

COMMENT ON COLUMN veltzy.leads.first_name IS 'Primeiro nome. Mantido pelo trigger sync_name_parts.';
COMMENT ON COLUMN veltzy.leads.last_name  IS 'Sobrenome (resto do nome). Mantido pelo trigger sync_name_parts.';

-- 2. Split puro: colapsa espaços, 1ª palavra = first, resto = last.
--    Placeholder (nulo, vazio, 'Contato %', só dígitos/telefone) → (NULL, NULL).
CREATE OR REPLACE FUNCTION veltzy.split_lead_name(p_name text, OUT first_name text, OUT last_name text)
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v   text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  pos int;
BEGIN
  IF v = '' OR v ILIKE 'Contato %' OR v ~ '^[0-9+() -]+$' THEN
    first_name := NULL;
    last_name  := NULL;
    RETURN;
  END IF;
  pos := strpos(v, ' ');
  IF pos = 0 THEN
    first_name := v;
    last_name  := NULL;
  ELSE
    first_name := left(v, pos - 1);
    last_name  := nullif(substr(v, pos + 1), '');
  END IF;
END;
$$;

-- 3. Trigger function
CREATE OR REPLACE FUNCTION veltzy.sync_lead_name_parts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_first    text := nullif(btrim(regexp_replace(coalesce(NEW.first_name, ''), '\s+', ' ', 'g')), '');
  v_last     text := nullif(btrim(regexp_replace(coalesce(NEW.last_name,  ''), '\s+', ' ', 'g')), '');
  v_composed text;
  s_first    text;
  s_last     text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_first IS NOT NULL OR v_last IS NOT NULL THEN
      NEW.first_name := v_first;
      NEW.last_name  := v_last;
      NEW.name       := concat_ws(' ', v_first, v_last);
    ELSE
      SELECT s.first_name, s.last_name INTO s_first, s_last FROM veltzy.split_lead_name(NEW.name) s;
      NEW.first_name := s_first;
      NEW.last_name  := s_last;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: first/last mudaram → recompõe name; senão, name mudou → split.
  IF NEW.first_name IS DISTINCT FROM OLD.first_name OR NEW.last_name IS DISTINCT FROM OLD.last_name THEN
    NEW.first_name := v_first;
    NEW.last_name  := v_last;
    v_composed := concat_ws(' ', v_first, v_last);
    IF v_composed <> '' THEN
      NEW.name := v_composed;
    END IF;
  ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
    SELECT s.first_name, s.last_name INTO s_first, s_last FROM veltzy.split_lead_name(NEW.name) s;
    NEW.first_name := s_first;
    NEW.last_name  := s_last;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Backfill (antes do trigger; on_updated desligado para não mexer em updated_at)
ALTER TABLE veltzy.leads DISABLE TRIGGER on_updated;

UPDATE veltzy.leads l
SET first_name = s.first_name,
    last_name  = s.last_name
FROM veltzy.leads src
CROSS JOIN LATERAL veltzy.split_lead_name(src.name) s
WHERE l.id = src.id
  AND l.first_name IS NULL
  AND l.last_name IS NULL
  AND (s.first_name IS NOT NULL OR s.last_name IS NOT NULL);

ALTER TABLE veltzy.leads ENABLE TRIGGER on_updated;

-- 5. Trigger
DROP TRIGGER IF EXISTS sync_name_parts ON veltzy.leads;
CREATE TRIGGER sync_name_parts
  BEFORE INSERT OR UPDATE OF name, first_name, last_name ON veltzy.leads
  FOR EACH ROW EXECUTE FUNCTION veltzy.sync_lead_name_parts();
```

RLS: nenhuma policy nova. `veltzy.leads` já tem RLS por `company_id`; as colunas novas herdam. As duas funções são `SECURITY INVOKER` e só tocam a própria linha (`NEW`), sem leitura de outras tabelas.

Verificação pós-aplicação (staging, SELECT):
```sql
select count(*) filter (where first_name is not null) com_first,
       count(*) filter (where first_name is null and last_name is null) sem_partes
from veltzy.leads;
-- esperado staging: com_first = 92, sem_partes = 12
```
Depois do B1: `supabase gen types` não se aplica ao Veltzy (tipos à mão); o B2 atualiza `src/types/database.ts`.

## O que fazer em cada arquivo
### B2
- `src/types/database.ts`: `Lead` ganha `first_name: string | null`, `last_name: string | null`. `CreateLeadInput` ganha `first_name?: string`, `last_name?: string | null`. `UpdateLeadInput` ganha `first_name?: string | null`, `last_name?: string | null`. `name` fica nos inputs (writers que já usam seguem compilando).
- `_shared/blast-render.ts`: `FREE_VAR_MAP` = `nome→first_name`, `sobrenome→last_name`, `nome_completo→name`, `telefone→phone`, `empresa→company_name`. Atualizar o comentário do `renderMessageBody`.
- `_shared/blast-render.test.ts`: casos `{{nome}}` → primeiro nome, `{{sobrenome}}`, `{{nome_completo}}`, `{{NOME}}` (case-insensitive), first nulo → `''`.
- `process-cadences/index.ts`: select do lead passa a `id, phone, name, first_name, last_name, company_name, tags, marketing_opt_out, whatsapp_instance_name`; tipo do `lead` em `executeStep` acompanha; `send_message` usa `renderMessageBody(String(cfg.content ?? ''), lead)`. Import de `renderMessageBody` do `_shared/blast-render.ts`.
- `campaign-wizard.tsx`: placeholder e dica `{{nome}} · {{sobrenome}} · {{nome_completo}} · {{telefone}} · {{empresa}}`. Mapping de template: opções `lead.first_name` "Primeiro nome" (default no lugar de `lead.name`, linhas ~157 e ~328), `lead.last_name` "Sobrenome", `lead.name` "Nome completo", `lead.company_name` "Empresa do contato".
- `cadence-form.tsx`: placeholder com a mesma lista de variáveis.

### B3
- `leads.service.ts` `createLead`: grava `first_name`/`last_name` quando vierem; só manda `name` se não vier `first_name` (compatibilidade). `updateLead` sem mudança (payload repassa os campos).
- `new-contact-modal.tsx`: campo `name` vira `first_name` (label "Nome", obrigatório) + `last_name` ("Sobrenome", opcional), lado a lado. Criação manda `first_name`/`last_name`; edição manda os dois via `updateLead`. Semeia com `contact.first_name`/`last_name`.
- `edit-lead-modal.tsx`: mesmo par de campos; envia só os dirty (`first_name`, `last_name`), nunca `name`.
- `contact-panel.tsx`: troca o estado `name` por `firstName`/`lastName`, semeados por `useLeadDetail(lead.id)` (a RPC da lista não traz first/last). Save manda `first_name`/`last_name`.
- Testes `edit-lead-modal.test.tsx`, `contact-panel.test.ts`: ajustar para os campos novos.
- `csv-parser.ts`: `LeadField` ganha `'last_name'`; `LEAD_FIELD_LABELS.last_name = 'Sobrenome'`; `AUTO_MAP` ganha `sobrenome`, `último nome`, `ultimo nome`, `last name`, `last_name`, `surname` → `last_name`.
- `import-leads.service.ts`: `ImportableRow.last_name?`; `mapCsvRowToLead` trata `last_name`; no insert, se a linha tem `last_name`, grava `first_name = row.name` + `last_name` (name sai do trigger); senão grava só `name`. Nome do negócio criado no import usa o nome composto (`[name, last_name].join(' ')`).
- `csv-parser.test.ts`, `import-leads.test.ts`: auto-map de `sobrenome`/`last name`; linha com e sem sobrenome.

### B4: causa raiz e correção (painel do contato no inbox)
Causa raiz: `src/pages/inbox.tsx` passa ao `ContactPanel` o lead da lista de conversas (`conversationLead`, vindo da RPC `veltzy.get_conversation_list`). A RPC devolve colunas explícitas e não inclui `company_name`, `instagram_handle`, `linkedin_url`, `first_name`, `last_name` (nem `cloud_api_number_id`, `first_response_at`, não editáveis). O painel semeava o estado local desse objeto parcial (campos ausentes nascem `''`) e tanto o `handleSave` quanto o `flushFields` (troca de conversa / fechar / desmontar) mandavam o objeto inteiro (`company_name: companyName || null` etc.). Resultado: editar qualquer campo de um lead aberto pela lista gravava `null` em empresa, Instagram e LinkedIn. Só não acontecia com lead aberto pelo caminho `directLead` (`getLeadById`, `select *`).

Correção (sem mexer na RPC):
- `src/lib/contact-panel-payload.ts` (novo): `buildContactPanelPayload(values, touched, firstNameMissing)` monta o payload só com os campos tocados; first/last vão juntos se qualquer um foi tocado; nada de nome se o Nome obrigatório ficou vazio; `name` nunca vai.
- `contact-panel.tsx`: `touched: Set<ContactPanelField>` (zerado na troca de lead e após salvar); `markDirty(field)` marca o campo; efeito semeia TODOS os campos editáveis pelo `useLeadDetail(lead.id)` quando o detalhe chega, sem sobrescrever campo já tocado (observações só se não há edição pendente); `handleSave` e `flushFields` usam o builder e não chamam o update com payload vazio.
- `contact-panel.test.ts`: regressão (lead da RPC sem `company_name`, salvar `email` → payload só `{ email }`) + casos de nome.
- Outros pontos do inbox com o mesmo padrão (estado semeado de objeto parcial + save do objeto inteiro): nenhum. `chat-header`, `chat-window`, `conversation-item` só leem o lead; únicas escritas de lead no inbox estão no `contact-panel`.

## Contratos não óbvios
```ts
// leads.service.ts createLead (insert)
first_name: input.first_name ?? undefined,
last_name: input.last_name ?? undefined,
name: input.first_name ? undefined : input.name,

// blast-render.ts
const FREE_VAR_MAP: Record<string, string> = {
  nome: 'first_name',
  sobrenome: 'last_name',
  nome_completo: 'name',
  telefone: 'phone',
  empresa: 'company_name',
}
```
Regra do trigger (para o client): nunca montar `name` no client. Mandar `first_name`/`last_name`; o banco recompõe. Writer que manda só `name` continua válido (split automático).

## Critérios de aceite
- [ ] B1: colunas existem; contagem pós-backfill no staging bate (92 com first, 12 sem partes).
- [ ] INSERT só com `name = 'Maria  Aparecida Souza'` → first `Maria`, last `Aparecida Souza`.
- [ ] INSERT com first `João`, last `Silva` → `name = 'João Silva'`.
- [ ] UPDATE de `last_name` para NULL → `name = first_name`.
- [ ] UPDATE de `name` (writer automático) → first/last recalculados.
- [ ] UPDATE só de `tags` não dispara o trigger de nome.
- [ ] `Contato 1234`, `+55 11 99999-9999`, `''`, NULL → first/last NULL.
- [ ] Campanha livre com `{{nome}} {{sobrenome}} / {{nome_completo}}` renderiza certo; desconhecida vira `''`.
- [ ] Cadência `send_message` com `{{nome}}` chega renderizada na `message_queue`.
- [ ] Wizard de campanha: default do mapping é "Primeiro nome".
- [ ] Novo contato: Nome obrigatório, Sobrenome opcional; `name` gravado composto.
- [ ] Editar Sobrenome no modal do pipeline e no painel do inbox atualiza `name` exibido.
- [ ] Import com coluna `Sobrenome` grava first/last; sem a coluna, comportamento atual.
- [ ] B4: no inbox, abrir lead pela lista (com empresa/Instagram/LinkedIn preenchidos), editar só o email e salvar ou trocar de conversa → empresa, Instagram e LinkedIn continuam no banco; os campos aparecem preenchidos no painel depois que o detalhe carrega.
- [ ] `npm run build` e testes verdes; `deno check` sem erro novo nas edge functions tocadas.

## Decisões tomadas
- Backfill com UPDATE explícito via `split_lead_name`, não `SET name = name`: com a regra de UPDATE do trigger, `name` sem mudança não dispara o split.
- Backfill roda antes de criar o trigger e com `on_updated` desligado: não altera `updated_at` (ordenações e "atualizado em" ficam intactos). `on_lead_activity` segue ligado; no UPDATE ele só loga troca de responsável, então o backfill não gera log.
- Split isolado em `veltzy.split_lead_name` (IMMUTABLE): uma regra só para trigger e backfill.
- Placeholder inclui telefone formatado (`+`, espaço, parênteses, hífen), não só dígitos: inbound grava telefone com máscara em alguns canais.
- UPDATE que zera first e last ao mesmo tempo mantém o `name` anterior: evita lead com `name` vazio por limpeza acidental.
- INSERT com first/last e também `name`: first/last vencem (é o caminho dos formulários).
- `search_path = ''` nas duas funções (só builtins de `pg_catalog` e `veltzy.` qualificado).
- `{{nome}}` sem fallback para `name` quando `first_name` é nulo: nulo só acontece em placeholder, e `'Olá, '` é melhor que `'Olá, Contato 1234'`.
- `blast-dispatch` não muda: já faz `select('*')` no lead.
- Campanhas salvas com mapping explícito `lead.name` seguem com nome completo; só o default de campanha nova muda.
- `process-cadences` passa a buscar `company_name` também: corrige `lead.company_name` vazio em `send_template` de cadência, mesmo select.
- Painel do inbox semeia Nome/Sobrenome por `useLeadDetail` em vez de mudar a RPC `get_conversation_list` (evita DROP/CREATE de RPC no Hub).
- Nome obrigatório na criação. Na edição, obrigatório só se o lead já tinha `first_name` (não deixa apagar), para não travar a edição de lead inbound sem nome (placeholder).
- Import: com coluna de sobrenome, a coluna mapeada como Nome vira `first_name`; sem ela, segue gravando `name` (split no banco).
- `src/types/database.ts` é atualizado à mão: o arquivo não é saída do `gen types`.
- Painel do inbox: `first_name`/`last_name` só vão no payload se o usuário mexeu neles (regra hoje em `buildContactPanelPayload`, `src/lib/contact-panel-payload.ts`, ver B4). Sem isso, salvar outro campo antes do `useLeadDetail` chegar zeraria first/last no banco.
- Modais (novo contato e edição do pipeline): Nome e Sobrenome lado a lado; Telefone passa a dividir linha com Email.
- B4: correção no client (só campos tocados + semeadura pelo detalhe) em vez de ampliar a RPC `get_conversation_list`: não precisa de migration, e mesmo com a RPC completa mandar o objeto inteiro seguiria sujeito a sobrescrever com valor velho.
- B4: o efeito de semeadura chama setState dentro do efeito (`react-hooks/set-state-in-effect`, +1 erro de lint no arquivo), mesmo padrão do efeito de reset que já existe ali; reestruturar o painel para evitar isso fica fora do escopo.
