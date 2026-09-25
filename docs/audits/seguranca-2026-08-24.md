# Varredura de Seguranca — Veltzy

**Data:** 2026-08-24
**Branch:** develop @ de0e4b3
**Escopo:** RLS e migrations do Veltzy (70) **e do Hub/Central (31 + 38 arquivadas + baseline)**, Edge Functions (25), frontend (331 arquivos), Storage, dependencias, headers HTTP
**Metodo:** analise estatica dos dois repositorios. O baseline do Hub (`00000000000000_baseline.sql`, commit `9d63751` de 2026-07-19) e um `pg_dump` do banco real, entao os achados de RLS, policy e GRANT abaixo estao **confirmados contra o estado do banco**, nao apenas inferidos das migrations. Nao houve teste de exploracao (ver "Limites desta varredura").
**Revisao de status:** 2026-09-09. Cada achado abaixo ganhou uma linha **Status**, e o consolidado esta em [Estado da correcao](#estado-da-correcao-2026-09-09). O semaforo logo abaixo e o retrato de 2026-08-24 e foi preservado como historico.

---

## Semaforo geral: 🔴 VERMELHO

| Severidade | Qtd |
|---|---|
| 🔴 Critico | 6 |
| 🟠 Alto | 8 |
| 🟡 Medio | 10 |

**Pode entrar em producao multi-tenant?** Nao. Existe uma cadeia de tres passos que leva um usuario recem-cadastrado a `super_admin` da plataforma inteira, sem nenhum exploit sofisticado: e tudo chamada normal de PostgREST com a anon key.

**Agravante descoberto na conferencia do Hub:** o Central nao hospeda so o Veltzy. O mesmo banco tem o schema `lemya` (41 tabelas de outro produto) e o control-plane de IA. O `super_admin` do passo 4 nao e "admin do Veltzy" — e bypass de RLS sobre **os tres schemas**, incluindo os tokens WABA em texto claro de todos os clientes Cloud API (ver A7).

---

## Estado da correcao (2026-09-09)

Revisao feita 16 dias depois da varredura, conferindo cada achado contra o codigo
em `develop` e contra as migrations do Hub, uma a uma.

> **Como o estado foi apurado.** Os dois ambientes foram consultados em
> 2026-09-09, sem alterar o link de nenhum repo (`--project-ref`):
> `supabase migration list` no staging (`hfeb...`) e em producao (`zxef...`),
> mais `supabase functions list` em producao para saber o que esta **deployado**,
> que e o unico jeito de responder por achado de Edge Function. Migration
> aplicada e function deployada sao coisas diferentes e aqui estao separadas.
>
> Continua valendo o limite da varredura original: nada foi demonstrado por
> exploracao, so por leitura de codigo, de migration e do estado remoto.

| | Qtd | Achados |
|---|---|---|
| ✅ Corrigido **e ja em producao** | 15 | C1, C2, C3, C4, C5, C6, A1, A3, A4, A5, A6, M1, M2, M3, e o A8 (ver ressalva) |
| 🟡 Corrigido **so no staging** | 2 | M5, M10 |
| 🟠 Em transito | 4 | A7, M8, M9, M6 |
| ❌ Aberto | 3 | A2, M4, M7 |

Ressalva no A8: sao headers no `vercel.json`, entao quem responde e o deploy da
Vercel, nao o Supabase. Conferido em 09/09 por `curl -I https://app.veltzy.com`:
os seis estao no ar. Fica um residuo documentado no proprio achado, o CSP sem
`script-src`, que nao invalida o ✅ do achado original ("sem headers no deploy")
mas continua sendo trabalho aberto.

**A cadeia de takeover esta fechada nos dois ambientes.** Os quatro passos
dependiam de C1 e C2, e as duas migrations (`hub/20260824120000` e
`hub/20260826120000`) constam como aplicadas tanto no staging quanto em
producao. O semaforo vermelho da varredura original respondia "pode entrar em
producao multi-tenant? Nao" por causa dessa cadeia: essa resposta mudou, e
mudou tambem para producao.

O que sobra em producao nao e mais escalonamento de privilegio, e sim exposicao
de dado (A2) e higiene de GRANT (M5/M10, corrigidos so no staging).

### Staging x producao

As migrations do Hub que existem no repo e **nao constam em producao**:

| Migration | Achado | Situacao |
|---|---|---|
| `20260904120000` | M5 + M10 | corrigido no staging, **falta promover** |
| `20260908120000` / `20260908130000` | A7 Instagram (fases 1 e 3) | so no staging |
| `20260909120000` | M9 | escrita, nao aplicada em lugar nenhum |
| `20260909130000` / `20260909140000` | M8 (fases 1 e 3) | escritas, nao aplicadas em lugar nenhum |

**Producao esta coerente no A7 do Instagram, o staging nao.** Em producao nao ha
nem as migrations nem o deploy da fase 2: codigo antigo lendo coluna que ainda
existe, funcionando. No staging as fases 1 e 3 foram aplicadas em 08/09 e a
coluna `access_token` **ja foi dropada**, mas a fase 2 so entrou na `develop` em
09/09 e ainda nao foi deployada. **O risco de Instagram quebrado e do staging,
nao de producao** (a revisao anterior deste documento nao fazia essa distincao).

Aparece tambem drift no outro sentido: tres migrations constam em producao e
**nao existem no repo** (`20260818174410`, `20260818182306`, `20260818182414`),
sinal de mudanca aplicada direto pelo dashboard. Nao foram auditadas.

### O que falta aplicar ou deployar

Nesta ordem, porque a ordem importa:

1. Aplicar no staging: `hub/20260909120000` (M9) e `hub/20260909130000` (M8 fase 1).
2. Deploy do Veltzy a partir da `develop`. Cobre a fase 2 do M8 (`9797127`) **e a
   fase 2 do A7 do Instagram** (`8a96ed4`), que e a que desfaz a incoerencia do
   staging descrita acima.
3. So depois do passo 2: aplicar `hub/20260909140000` (M8 fase 3).
4. Promover para producao: `20260904120000` (M5 + M10), que e correcao pronta e
   testada no staging ha cinco dias e nao foi junto.
5. M6: deployar `provision-company` e `accept-invite`, avisar o Lemya, e so entao
   ligar a politica de senha no Auth hospedado, staging antes de producao.

### Correcao de premissa no A7

Duas das quatro tabelas do A7 nao sao o que o achado descreve, e isso so
apareceu ao ir escrever a correcao:

- **`veltzy.whatsapp_configs` esta morta.** Nenhum dos dois repos le a tabela.
  Portar para o Vault seria cofre sem leitor. A correcao certa e dropar
  `instance_token` e `client_token`.
- **`veltzy.payment_configs` nao tem consumidor.** Nenhuma edge function chama
  os provedores de pagamento. Decidir o destino da feature antes de portar.

Fica a licao de processo: **antes de escrever migration de Vault para uma
tabela, grepar quem le a coluna nos dois repos.** Se ninguem le, a correcao e
remover, nao guardar melhor.

### Achado novo, fora do catalogo original

**O token Z-API em uso vive em `oauth_integrations.metadata` (jsonb), em texto
claro, e e legivel por qualquer membro autenticado da empresa via PostgREST**,
vendedor incluido. E o mesmo tipo de exposicao que o A7 cataloga, na tabela que
o A7 nao olhou, e e a que de fato guarda a credencial em uso. Combinado com o
M3 (que so passou a exigir admin/manager depois), qualquer `seller` que abrisse
o devtools tinha a credencial do WhatsApp da empresa. Nao esta corrigido e
precisa de decisao propria: o front le `metadata` inteiro em
`whatsapp.service.ts`, `messages.service.ts` e `use-whatsapp-status.ts`, entao
tirar o token dali exige separar o que e configuracao do que e segredo.

## A cadeia principal (C1 → C2)

> **Fechada em 2026-09-09, no staging.** Os quatro passos abaixo dependiam de
> C1 e C2, corrigidos por `hub/20260824120000` e `hub/20260826120000`, as duas
> aplicadas. O passo 2 nao le mais convite de outro tenant, o passo 3 confere
> `auth.uid()` e email, e o passo 4 esbarra em `WITH CHECK`. O texto segue
> abaixo como registro do que era possivel, nao do que e.

Isto nao sao tres achados soltos. Sao os elos de um mesmo ataque:

```
1. Sign up aberto (auth.service.ts:3)
        ↓  qualquer pessoa vira "authenticated"
2. SELECT * FROM invitations         ← policy USING (true), migration 034
        ↓  le convites pendentes de TODOS os tenants (id, email, role, token)
3. rpc('accept_invitation', { p_invitation_id: <qualquer>, p_user_id: <o meu> })
        ↓  a funcao nao valida email nem auth.uid() — migration 050
   >>> agora sou ADMIN da empresa alvo
4. INSERT INTO user_roles (user_id, company_id, role)
   VALUES (auth.uid(), <qualquer company>, 'super_admin')
        ↓  policy "Admins can manage roles" sem WITH CHECK e sem escopo de company
   >>> agora sou SUPER_ADMIN da Daxen Labs
```

Cada passo abaixo esta documentado com arquivo e linha.

---

## 🔴 CRITICO

### C1. Qualquer usuario autenticado le os convites de todos os tenants e entra em qualquer empresa

**Status (2026-09-09):** ✅ **Corrigido**, aplicado no staging **e em producao**. `hub/20260824120000_fix_c1_invitation_security.sql` revoga SELECT/INSERT/UPDATE do `anon`, troca a policy aberta por `invitations_select_scoped` (proprio email, propria empresa ou super admin), cria `get_invitation_by_token` SECURITY DEFINER para o fluxo legitimo por token, e refaz `accept_invitation` sem o parametro `p_user_id`: agora usa `auth.uid()` e recusa quando `lower(_invite.email) <> lower(auth.jwt()->>'email')`.

**Arquivos:** `veltzy/supabase/migrations/034_fix_invitations_rls.sql:15-17` e `050_fix_accept_invitation_app_role_cast.sql:10-77`
**Confirmado no banco real:** `hub/supabase/migrations/00000000000000_baseline.sql:7107` (policy) e `:516-575` (funcao, byte a byte identica). Nenhuma das 31 migrations pos-baseline do Hub toca nesses objetos.

Dois defeitos que se somam:

```sql
-- 034: SELECT: publico (necessario para aceitar convite por token)
create policy "invitations_select_public" on public.invitations
  for select using (true);
```

A policy nao filtra nada — e, no dump do banco, **nao tem clausula `TO`**, entao vale para todos os roles, `anon` inclusive. Pior: o GRANT no banco real e mais largo do que a migration do Veltzy sugeria:

```sql
-- hub/baseline:9289
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."invitations" TO "anon";
```

Ou seja: **`select * from invitations` funciona sem nenhum login**, so com a anon key que esta publicada no bundle JS. Devolve id, email, role, company_id e token de todos os convites pendentes da plataforma. O comentario da migration diz que o SELECT aberto e "necessario para aceitar convite por token", mas a consulta por token (`aceitar-convite.tsx:165`) so precisa da linha daquele token — nao de todas.

E a RPC que consome esse id nao valida nada sobre quem chama:

```sql
CREATE FUNCTION public.accept_invitation(p_invitation_id uuid, p_user_id uuid, p_name text)
... SECURITY DEFINER ...
  SELECT * INTO _invite FROM public.invitations
  WHERE id = p_invitation_id AND status = 'pending' AND expires_at > now();
  -- nunca compara _invite.email com o email do chamador
  -- nunca compara p_user_id com auth.uid()
  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (p_user_id, _invite.company_id, _final_role);
```

**Impacto:**
- Vazamento de toda a base de convites **sem autenticacao nenhuma** (LGPD): emails corporativos e estrutura de equipe de todos os clientes.
- Entrar em qualquer empresa com o role do convite (frequentemente `admin`). Este passo precisa de um `user_id`, entao exige uma conta — mas o signup e aberto, entao e formalidade.
- Passar o `p_user_id` de **outra pessoa**: a funcao faz `DELETE FROM user_roles WHERE user_id = p_user_id AND company_id IS NOT NULL` antes de inserir. Da pra arrancar um usuario legitimo da empresa dele e joga-lo em outra.
- Branch de auto-admin (050:36-41): se a empresa alvo estiver sem admin, o invasor vira admin independente do role do convite.
Um alivio verificado: `get_user_id_by_email` (baseline:1017) so tem EXECUTE para `service_role`, entao nao da para descobrir o UUID de uma vitima especifica por email e sequestrar a conta dela remotamente.

**Correcao:**
0. `REVOKE SELECT, INSERT, UPDATE ON public.invitations FROM anon;` — o `anon` nao tem por que tocar nessa tabela.
1. Trocar a policy de SELECT por uma que exija o token: `using (token = current_setting('request.headers')::json->>'x-invite-token')` ou, mais simples, mover a validacao de token para uma RPC `SECURITY DEFINER` (`validate_invitation(p_token)`) e remover o SELECT direto (`revoke select on public.invitations from authenticated, anon`).
2. Em `accept_invitation`: remover o parametro `p_user_id` e usar `auth.uid()`; comparar `_invite.email` com `(select email from auth.users where id = auth.uid())`, retornando erro se divergir.
3. Reavaliar o branch de auto-admin — hoje ele e um bypass do role do convite.

---

### C2. Qualquer admin de tenant se promove a super_admin

**Status (2026-09-09):** ✅ **Corrigido**, aplicado no staging **e em producao**. `hub/20260826120000_fix_c2_user_roles_policy.sql` derruba a policy `FOR ALL` sem `WITH CHECK` e a substitui por quatro policies por comando, todas com `WITH CHECK` explicito, escopo `company_id = get_current_company_id()` e a condicao `role <> 'super_admin'` para quem nao e super admin. O passo 4 da cadeia deixa de existir.

**Arquivo:** `veltzy/supabase/migrations/001_foundation.sql:349-351`
**Confirmado no banco real:** `hub/baseline:7001`. Nenhuma migration posterior a substitui — verificado nas 70 do Veltzy, nas 31 do Hub e nas 38 arquivadas.

```sql
CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL TO authenticated
USING (is_company_admin() OR is_super_admin());
```

Dois problemas:
- **Sem `WITH CHECK`.** No Postgres, policy `FOR ALL` sem `WITH CHECK` reutiliza a expressao do `USING` para INSERT/UPDATE. Como o `USING` nao olha para a linha sendo inserida, qualquer INSERT passa.
- **Sem escopo de `company_id`.** A policy nao amarra a linha a empresa do admin.

Resultado: um admin de qualquer cliente executa, do proprio navegador:

```js
await supabase.from('user_roles').insert({
  user_id: (await supabase.auth.getUser()).data.user.id,
  company_id: '<company_id de qualquer outro tenant>',
  role: 'super_admin'
})
```

E ganha bypass de RLS em toda a plataforma, incluindo impersonation no painel super-admin. `is_company_admin()` (001:162-170) tambem nao filtra por empresa — basta ter a role `admin` em qualquer lugar.

**O que o `super_admin` abre, verificado no Hub:** os 41 tabelas do schema `lemya` (outro produto no mesmo banco), o control-plane de IA, e — o mais direto — `public.cloud_api_credentials`, cuja unica policy e `FOR SELECT TO authenticated USING (is_super_admin())` (`hub/20260806140000:11-15`) com `GRANT SELECT ... TO authenticated` (`hub/20260808183000:27`). A tabela guarda `access_token` **em texto claro** (baseline:2931): o token de sistema WABA de cada cliente. Com ele se envia WhatsApp em nome de qualquer empresa cliente. O comentario da migration diz "o front so LE", mas o PostgREST deixa o cliente escolher as colunas — nada impede `select=access_token`.

**Contraste util:** as policies equivalentes do `lemya` (baseline:6575-6953) tambem sao `FOR ALL` so com `USING`, mas todas passam `company_id` para `user_has_permission(company_id, ...)`. Como o `USING` vira o `WITH CHECK`, a linha nova e checada contra a empresa. Elas estao corretas. O defeito do `user_roles` e especifico: `is_company_admin()` nao olha a linha.

**Correcao:**
```sql
DROP POLICY "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Admins can manage company roles"
ON public.user_roles FOR ALL TO authenticated
USING (
  (company_id = get_current_company_id() AND is_company_admin() AND role <> 'super_admin')
  OR is_super_admin()
)
WITH CHECK (
  (company_id = get_current_company_id() AND is_company_admin() AND role <> 'super_admin')
  OR is_super_admin()
);
```
`super_admin` so deve ser concedido por migration ou pelo painel de servico, nunca por RLS de tenant.

---

### C3. `ai-copilot` entrega PII de qualquer tenant sem autenticacao

**Status (2026-09-09):** ✅ **Corrigido e no ar em producao** (deploy de 01/09 13:05). `ai-copilot/index.ts:26-74` exige `Authorization`, resolve `company_id` pelo perfil do token e ignora o que vier no body.

**Arquivo:** `supabase/functions/ai-copilot/index.ts:18-201`

A funcao nao esta em `supabase/config.toml`, entao `verify_jwt` fica no default `true` — o que so exige um JWT valido do projeto, e **a anon key e um JWT valido do projeto** e esta publicada no bundle JS. Na pratica, e uma funcao aberta.

Dentro dela:
```ts
const supabase = createClient(url, SERVICE_ROLE_KEY, { db: { schema: 'veltzy' } })  // :24 — bypassa RLS
const body = await req.json()
if (body.action === 'sales-pulse') {
  const { company_id, user_profile_id, role, user_name } = body   // :31 — tenant vem do cliente
```
Nao ha `getUser()`, nao ha checagem de pertencimento. O `role` tambem vem do body e controla se o filtro por vendedor e aplicado (`:41`), entao basta omiti-lo para ver a empresa toda.

O que a resposta devolve (`:61,74,110,124,133`): nomes de leads, telefones, temperatura, valores de deals em aberto e **preview das ultimas mensagens de conversa**. O system prompt em `:161` instrui explicitamente "cite nomes, valores e prazos reais", e a resposta e devolvida ao chamador em `:200`.

Bonus para o atacante: a chamada roda em `hub.complete({ company_id })` (`:170`), ou seja, o custo de IA e debitado no orcamento do **tenant vitima** — vira negacao de servico financeira.

Falta so um `company_id` valido, e o C10 abaixo entrega a lista completa.

**Correcao:** validar o Bearer token com `auth.getUser()`, buscar `profiles.company_id` do usuario e **ignorar o `company_id` do body**, exatamente como `whatsapp-send/index.ts:56-73` ja faz. Derivar `role` de `user_roles`, nunca do payload.

---

### C4. `instagram-send` envia DM por qualquer empresa, sem autenticacao

**Status (2026-09-09):** ✅ **Corrigido e no ar em producao** (deploy de 01/09 13:05). `instagram-send` valida `auth.getUser` e deriva `company_id` do perfil (commit `793b180`).

**Arquivo:** `supabase/functions/instagram-send/index.ts:12-33` (`verify_jwt = false` em `config.toml`)

```ts
const { leadId, content, companyId } = await req.json()
const { data: connection } = await supabase
  .from('instagram_connections').select('access_token, page_id').eq('company_id', companyId).single()
```

Sem nenhuma verificacao. Um POST anonimo:
- envia DM do Instagram **em nome do cliente** para qualquer lead dele;
- insere uma linha em `messages` (`:31`), plantando mensagem falsa no inbox de qualquer tenant.

**Correcao:** mesmo padrao do C3. Enquanto isso, `verify_jwt = true` ja reduz a superficie (mas nao resolve — ver nota sobre anon key no C3).

---

### C5. `send-invite-email` e um relay de email aberto com a marca Veltzy

**Status (2026-09-09):** ✅ **Corrigido e no ar em producao** (deploy de 01/09 13:06). `send-invite-email/index.ts:30-36` exige `Authorization` e valida o JWT antes de disparar o email.

**Arquivo:** `supabase/functions/send-invite-email/index.ts:8-100` (`verify_jwt = false`)

```ts
const { invite_id, email, role, company_name, token, invited_by_name } = await req.json()
// nenhuma validacao de origem, CORS '*'
const acceptLink = `${appUrl}/aceitar-convite?token=${token}`
... <strong>${invited_by_name}</strong> convidou voce ... <strong>${company_name}</strong> ...
<a href="${acceptLink}">
```

Qualquer pessoa na internet dispara emails pela conta Brevo do produto, com destinatario, remetente aparente e texto controlados. Alem disso `token`, `invited_by_name` e `company_name` sao interpolados no HTML **sem escape** — `token` cai dentro de um atributo `href="..."`, entao aspa dupla no valor quebra o atributo e injeta markup arbitrario no corpo do email.

**Impacto:** phishing convincente com a marca Veltzy, queima da reputacao do dominio de envio (blacklist afeta os emails legitimos de todos os clientes), e consumo da cota Brevo.

**Correcao:** exigir header de segredo compartilhado (a funcao so e chamada server-side) ou validar JWT de admin; escapar as tres variaveis no HTML; restringir CORS.

---

### C6. `sdr-engine` executa o agent loop para qualquer lead/empresa, sem autenticacao

**Status (2026-09-09):** ✅ **Corrigido e no ar em producao** (deploy de 01/09 13:06). `sdr-engine` passou a exigir `auth.getUser` (commit `793b180`).

**Arquivo:** `supabase/functions/sdr-engine/index.ts:26-45`

```ts
const supabase = createClient(supabaseUrl, SERVICE_ROLE_KEY, { db: { schema: 'veltzy' } })
const { leadId, companyId, messageContent, pipelineId, instanceName, sandbox } = await req.json()
```

Sem `getUser`, service_role, tenant vindo do body. O loop tem ferramentas com efeito colateral registradas em `:25`: `qualify-lead`, `update-lead-field`, `escalate-to-human`, `query-business-knowledge`. Um chamador anonimo consegue **escrever nos leads de qualquer tenant**, escalar para humano, e queimar o orcamento de IA da vitima.

Some-se a isso que `messageContent` vai direto para o prompt do modelo: e um canal de prompt injection sem nem precisar passar por um lead real.

**Correcao:** esta funcao e chamada por `lead-inbound-handler` (server-side). Proteger com segredo compartilhado, como `evolution-inbound` ja faz (`evolution-inbound/index.ts:43-53`).

**ADENDO (2026-08-27) — corrigido, com auth dual.** Ha dois callers, nao um: o `lead-inbound-handler` (service key) e o `AgentSandbox` do front (JWT de usuario, `sandbox: true`). O fix aplica o padrao `whatsapp-send`: service key → tenant do body; JWT → `companyId` do perfil, e exige `sandbox: true` (token de usuario nao dirige o loop real). A query do lead passou a escopar `.eq('company_id', companyId)` — antes buscava por `id` sem tenant. **Follow-up pendente:** `src/pages/sdr-ia.tsx:28` usa um `testLeadId` hardcoded (`376d8927-...`); com o escopo por empresa, o sandbox so funciona para o tenant dono desse lead e retorna 404 para os demais. Trocar por uma busca do primeiro lead da empresa logada. Nao bloqueia o C6 — e higiene do playground.

---

## 🟠 ALTO

### A1. `sdr-knowledge-ingest`: SSRF sem autenticacao

**Status (2026-09-09):** ✅ **Corrigido e no ar em producao** (deploy de 01/09 13:06). `sdr-knowledge-ingest` exige `auth.getUser`, e o front deixou de mandar `filePath` arbitrario (`2bed9c4`).

**Arquivo:** `supabase/functions/sdr-knowledge-ingest/index.ts:31-48`
```ts
const { agentProfileId, companyId, fileName, fileUrl, fileMimeType } = await req.json()
const fileResponse = await fetch(fileUrl)
```
Sem auth, service_role. A funcao busca **qualquer URL fornecida pelo chamador** a partir da infra Supabase — inclusive endpoints internos e metadata de cloud — e ainda sobrescreve o `knowledge_base_status` e os chunks de qualquer `agent_profile` (`:38-41`).
**Correcao:** autenticar; validar que `fileUrl` aponta para o bucket `agent-knowledge` do proprio `companyId` (ou receber apenas o path e montar a URL no servidor).

### A2. Bucket `chat-attachments` e publico

**Status (2026-09-09):** ❌ **Aberto.** Nada mudou: `019_storage_public_bucket.sql` continua valendo, ha 6 usos de `getPublicUrl` e nenhum `createSignedUrl` no repo.

**Complicador descoberto em 09/09, que o achado original nao registra:** a URL publica nao e so exibida, ela e **persistida**. `chat-input.tsx:140-143` e `lead-inbound-handler.ts:513,555,606` gravam o retorno de `getPublicUrl` dentro de `messages.file_url` e nos avatares em `leads`. Virar o bucket para privado quebra **todo o historico de midia**, nao apenas os uploads novos. A correcao real tem duas partes: passar a guardar o path em vez da URL, e um fallback que extraia o path das URLs ja gravadas na hora de assinar. Isso e trabalho de tamanho de feature com migracao de dados, e pede Spec propria.

**Arquivo:** `supabase/migrations/019_storage_public_bucket.sql:3`
```sql
UPDATE storage.buckets SET public = true WHERE name = 'chat-attachments';
```
Esse bucket guarda **toda a midia das conversas**: documentos, audios, fotos e videos que os clientes finais mandam no WhatsApp e Instagram, alem dos avatares. Uploads em `chat-input.tsx:134-141`, `audio-recorder.tsx:133`, `lead-inbound-handler.ts:490,532,583`, `cloud-api-media.ts:57`.

Publico significa: qualquer pessoa com a URL le o arquivo, sem login, sem checagem de tenant, e a URL do `getPublicUrl` **nunca expira**. Essas URLs sao gravadas em `messages.file_url` e trafegam pelo Hub. O caminho usa UUIDs, o que dificulta enumeracao — mas obscuridade nao e controle de acesso, e um documento de cliente (RG, contrato, comprovante) vazado por link permanente e incidente de LGPD reportavel.

**Correcao:** `public = false` + `createSignedUrl` com TTL curto nos pontos de exibicao. Requer ajuste no front e no re-upload de midia inbound.

### A3. Policies do Storage nao estao versionadas em nenhum dos dois repos

**Status (2026-09-09):** ✅ **Corrigido**, aplicado no staging **e em producao**. `hub/20260827130000_fix_a3_chat_attachments_policies.sql` versiona as quatro policies de `storage.objects` do bucket, filtrando por `(storage.foldername(name))[1]` contra `get_current_company_id()`. O controle de acesso do bucket passou a ser auditavel no repositorio.

Nao existe **nenhuma** policy de `storage.objects` para `chat-attachments` nas 70 migrations do Veltzy nem nas 69 do Hub. O Veltzy versiona so as tres de `agent-knowledge` (`053_sdr_v2_storage.sql:23-43`); o Hub versiona so as tres do bucket `iris-docs` (`20260722013120_iris_docs_bucket.sql:30-50`), com o filtro de tenant certinho. O padrao existe nos dois lados — nao foi aplicado ao bucket que guarda as conversas dos clientes. Como o upload autenticado do front funciona, as policies foram criadas direto no dashboard.

Consequencia: o controle de acesso real do bucket **nao e auditavel neste repositorio** e nao e reproduzido num ambiente novo. Se a policy de INSERT for so `bucket_id = 'chat-attachments'`, qualquer usuario autenticado de qualquer tenant grava (e com `upsert`, sobrescreve) no diretorio de outro cliente.
**Correcao:** exportar as policies atuais para uma migration e travar por `(storage.foldername(name))[1] = company_id::text`, como o `agent-knowledge` ja faz.

**ADENDO (2026-08-27) — confirmado em PRODUCAO e corrigido.** `pg_policies` no banco real mostrou o pior caso: as policies do `chat-attachments` (`company_download`/`company_upload`/`company_delete`, mais duplicatas `14tobej_0` do dashboard) eram escopadas SO por `bucket_id`, sem `company_id`. Qualquer usuario autenticado de qualquer tenant lia, sobrescrevia (`upsert`) e **apagava** midia de outro cliente pela API autenticada — mais grave que a leitura publica do A2. O layout dos paths, porem, tem TRES esquemas (conferido em producao): `media/{companyId}/...` (Hub `evolution-webhook-receiver:128`, 2131 arq., company na 2a pasta), `avatars/{leadId}.jpg` (751 arq., sem company) e `{companyId}/...` (Veltzy, ~180 arq.) — entao a policy nao pode copiar o `[1]=company_id` do `agent-knowledge` (bloquearia 2882 arquivos). Fix em `hub/.../20260827130000_fix_a3_chat_attachments_policies.sql`: SELECT cobre `{co}/` e `media/{co}/` + carve-out de leitura para `avatars/`; INSERT/UPDATE/DELETE so `{co}/` (media/ e avatars/ sao do service_role, bypass RLS). Fecha sem quebrar nada porque a exibicao hoje passa pela URL publica. **A2 (bucket privado + signed URL + backfill) segue como fase 2**; normalizar o path do avatar para incluir company e follow-up.

### A4. Webhooks sem validacao de assinatura

**Status (2026-09-09):** ✅ **Corrigido e no ar em producao** (`zapi-webhook` e `instagram-webhook` em 01/09 e 02/09, `source-webhook` em 08/09). Os tres passaram a validar remetente: `zapi-webhook:64-69` confere o header `z-api-token` contra `metadata.token` da config, `instagram-webhook` valida HMAC, e `source-webhook:22-40` exige Bearer com o `webhook_token` da integracao. Nao e assinatura HMAC nos tres, mas todos deixaram de aceitar POST anonimo.

`zapi-webhook`, `instagram-webhook` e `source-webhook` (todos `verify_jwt = false`) aceitam qualquer POST sem verificar remetente. Quem descobrir a URL injeta leads e mensagens falsas em qualquer tenant.
Bom contraste: `cloud-api-inbound/index.ts:4` valida HMAC via `verifyMetaSignature`, e `evolution-inbound/index.ts:43-53` valida segredo compartilhado. O padrao certo ja existe no repo — falta aplicar.

**ADENDO (2026-08-27) — 2 de 3 ja estavam corrigidos; so o instagram faltava.** Revisao do codigo real: `source-webhook:27-46` ja exige Bearer token validado contra `source_integrations.webhook_token` (401 se ausente/invalido/inativo — entrou com a feature webhook-inbound, depois do audit); `zapi-webhook:66-71` ja confere o header `z-api-token` contra o token por instancia (`config.metadata.token`). So `instagram-webhook` estava aberto (fazia `req.json()` direto). **Corrigido:** le o corpo cru e valida o HMAC-SHA256 da Meta (`x-hub-signature-256`) via `verifyMetaSignature`, com `appSecret = INSTAGRAM_APP_SECRET ?? META_APP_SECRET`, fail-closed (401) sem segredo ou assinatura invalida. Dependencia de deploy: `META_APP_SECRET` ja existe (cloud-api-inbound usa); se o Instagram for outro app Meta, setar `INSTAGRAM_APP_SECRET`.

### A5. Funcoes de cron publicamente invocaveis

**Status (2026-09-09):** ✅ **Corrigido e no ar em producao** (as cinco deployadas em 02/09 10:46). As cinco importam `_shared/cron-auth.ts`, que aceita service key ou o header `x-cron-secret` contra `CRON_SECRET`.

`distribute-queue`, `process-message-queue`, `check-sla`, `send-task-reminders`, `check-whatsapp-health` — todas `verify_jwt = false`, service_role, zero autenticacao. Qualquer um dispara em loop: redistribuicao forcada de leads entre vendedores, reenvio de fila de mensagens, spam de lembretes, e custo.
**Correcao:** header `CRON_SECRET` comparado com `Deno.env.get('CRON_SECRET')`, configurado no cron trigger.

### A6. CORS wildcard em 22 das 25 Edge Functions

**Status (2026-09-09):** ✅ **Corrigido e no ar em producao** (batch de 01/09 13:05, commit `7829796` promovido em `793b180`). `_shared/cors.ts` agora so exporta `getCorsHeaders(req)` com allowlist de dominios mais o regex de preview do Vercel; o export wildcard de retrocompatibilidade saiu e nao existe mais nenhum `'Access-Control-Allow-Origin': '*'` em `supabase/functions/`.

`_shared/cors.ts` ja tem `getCorsHeaders()` com allowlist de dominios — mas so 3 funcoes usam (`whatsapp-instance-manage`, `cloud-api-onboard-proxy`, `cloud-api-templates-proxy`). As outras 22 importam ou redeclaram `'Access-Control-Allow-Origin': '*'`, inclusive o export de retrocompatibilidade em `cors.ts:19-22`.
Wildcard permite que qualquer site chame as funcoes com a sessao do usuario, o que transforma os achados C3–C6 em algo explorável tambem por um link malicioso enviado a um funcionario do cliente.

### A7. Credenciais de integracao em plaintext — mas o Vault ja existe e ja funciona

**Status (2026-09-09):** 🟠 **Parcial, e duas das quatro premissas estavam erradas.**

| Tabela | Estado |
|---|---|
| `public.cloud_api_credentials` | ✅ no Vault. `hub/20260827140000` e `20260827150000`, aplicadas no staging **e em producao** |
| `veltzy.instagram_connections` | 🟠 so no staging: migrations aplicadas la (`hub/20260908120000` e `20260908130000`), codigo da fase 2 na `develop` (`8a96ed4`), **falta o deploy**. Producao nao tem nem as migrations nem o deploy, e por isso segue coerente |
| `veltzy.whatsapp_configs` | ⚠️ premissa errada: colunas mortas, ver abaixo |
| `veltzy.payment_configs` | ❌ aberto, e sem consumidor, ver abaixo |

**`whatsapp_configs` nao tem o que portar.** Nenhum dos dois repos le essa tabela. O caminho vivo do Z-API e `oauth_integrations` com `provider='zapi'`, e o token sai de `metadata->>'token'` (`whatsapp.service.ts:19-20`, `_shared/providers/zapi.ts:15`). No Hub a unica referencia e um `DELETE ... WHERE company_id` de limpeza de exclusao de empresa (`baseline:908`), que nao toca coluna. Cofre para segredo que ninguem busca nao compra nada: a correcao certa e **dropar `instance_token` e `client_token`**.

**`payment_configs` nao tem consumidor.** Nenhuma edge function chama asaas, stripe ou mercadopago. Um admin digita segredo no formulario de integracoes, o segredo vai para o banco em texto claro e nada nunca le. Antes de portar para o Vault, decidir se a feature continua.

**Risco de ordem, ja materializado uma vez, no staging.** As fases 1 e 3 do Instagram foram aplicadas no staging em 08/09, antes de a fase 2 estar na `develop`: a coluna `access_token` foi dropada com o codigo antigo ainda no ar. O merge de 09/09 fechou a janela no repositorio, mas o deploy ainda nao aconteceu, entao **no staging o Instagram esta com codigo que le uma coluna inexistente**. Producao escapou por nao ter recebido nenhuma das duas pontas. Regra que fica: fase 3 so depois de fase 2 **deployada**, nunca so commitada, e conferir com `functions list` em vez de assumir pelo commit.

Este achado mudou de figura ao conferir o Hub. **O Supabase Vault esta instalado e em uso no Central**, com o padrao correto:

```sql
-- hub/20260804151000_ai_secret_wrappers.sql:47-50
REVOKE EXECUTE ON FUNCTION public.ai_secret_upsert(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_secret_read(text)   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.ai_secret_upsert(text, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.ai_secret_read(text)   TO service_role;
```

Wrappers `SECURITY DEFINER` com `search_path = ''`, EXECUTE trancado no `service_role`, e a UI do super admin so enxerga `has_key`. Isso e exatamente o que o achado pedia — so que aplicado **apenas as chaves de provider de IA**.

Tudo o mais continua `text` puro (achado C6 do audit de 2026-04-26, ainda aberto), confirmado no dump:

| Tabela | Colunas | Linha no baseline |
|---|---|---|
| `veltzy.whatsapp_configs` | `instance_token`, `client_token` | 3953-3954 |
| `veltzy.instagram_connections` | `access_token` | 3479 |
| `veltzy.payment_configs` | `api_key`, `api_secret`, `webhook_secret` | 3640-3642 |
| `public.cloud_api_credentials` | `access_token` (token de sistema WABA) | 2931 |

A ultima e a mais grave e a mais recente: nasceu em `_archive/20260629000001_cloud_api_credentials.sql`, cinco semanas **antes** do trabalho de Vault, e e legivel via PostgREST por quem for `super_admin` (ver C2).

Nao ha mais objecao de infra: o cofre esta la, o wrapper esta escrito, o padrao esta provado em producao. Falta portar quatro tabelas.

**ADENDO (2026-08-27) — 1 de 4 portada (cloud_api_credentials), no staging.** Feita a mais grave/exposta primeiro, em 3 fases sensiveis a ordem de deploy: (1) `hub/.../20260827140000_..._phase1.sql` copia cada `access_token` para o Vault (chave `cloud_api_credentials.access_token.<id>`, reusando `ai_secret_upsert`) e tira o `NOT NULL`; (2) deploy de `cloud-api-send-message` (le via `lerSegredo`) e `cloud-api-onboard` (grava via `guardarSegredo`), com helper novo `_shared/vault-secret.ts`; (3) `hub/.../20260827150000_..._phase3.sql` dropa a coluna. Verificado no staging: tabela vazia la (0 credenciais), Fase 3 trivialmente segura; o front so le `company_id/status` (channels.service.ts:36), nao quebra. **Em producao a migracao de dados e real** (tokens WABA existentes) — a promocao pelo Toni deve rodar o mesmo gate (verifica-a7-fase2.sql: cada token com token na coluna tem segredo no Vault ANTES de aplicar a Fase 3) e um teste de envio entre a Fase 2 e a Fase 3. **Faltam 3 tabelas** com o padrao agora provado: `veltzy.whatsapp_configs` (instance_token, client_token), `veltzy.instagram_connections` (access_token), `veltzy.payment_configs` (api_key, api_secret, webhook_secret).

### A8. Sem headers de seguranca no deploy

**Status (2026-09-09):** ✅ **Corrigido e verificado no ar**, com um residuo registrado abaixo. `vercel.json` passou a ter os seis headers (`2bed9c4`), e os seis respondem em `https://app.veltzy.com` (conferido por `curl -I`). A regra de `/assets/` **soma** com a global em vez de sobrescrever: o bundle recebe `nosniff` e HSTS junto com o `Cache-Control`, conferido no mesmo teste.

**Residuo: o CSP so faz `frame-ancestors`.** O header existe e por isso bate em qualquer conferencia por nome, mas a unica directive era `frame-ancestors 'none'`, que duplica o `X-Frame-Options: DENY` ja presente. Sem `default-src`, `script-src`, `connect-src`, `base-uri`, `form-action` ou `object-src`, ele nao contribui nada contra injecao.

Em 09/09 entraram as tres directives que fecham vetores reais **sem risco de quebrar nada**, verificado antes de escrever: o repo nao tem nenhuma tag `<base>`, nenhum `<object>`/`<embed>`/`<applet>` (nem criado por `createElement`) e nenhum `<form action=>`.

```
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

**Continua faltando o `script-src`**, que e o que teria valor de verdade, principalmente enquanto o M4 estiver aberto: com dependencia comprometida (o `xlsx` recebe planilha de usuario e nao tem correcao no npm), `script-src` e o que impede o payload de buscar codigo de fora. Atenuante honesto: nao ha um unico `dangerouslySetInnerHTML` no `src/` e o React escapa por padrao, entao a superficie de XSS hoje e pequena, e isso e defesa em profundidade, nao tapa-buraco.

Nao e uma linha, e por isso ficou de fora: (1) `index.html:19` tem script inline de 1300 bytes (aplica tema e cor da marca antes do React montar, evitando flash), que exige hash `sha256-leBvtoAs8t/81ObYvlRApWVn6RjISOeNSYre6zanWy8=`, e **qualquer edicao nesse script invalida o hash e quebra o tema em producao**; (2) `connect.facebook.net/en_US/sdk.js` e carregado em runtime por `facebook-sdk.ts`; (3) `connect-src` precisa cobrir Supabase em `https` **e `wss`**, senao o realtime do inbox morre; (4) `img-src` precisa de `api.dicebear.com`, do storage, e de `data:`/`blob:`; (5) `style-src` precisa de `'unsafe-inline'` por causa do Radix. Ponto de teste obrigatorio quando for feito: o fluxo do Meta Embedded Signup, que hoje nao esbarra em nada porque nao existe `default-src`.

**Arquivo:** `vercel.json` — so tem `Cache-Control`. Faltam `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Sem `frame-ancestors`, o CRM pode ser embutido em iframe de terceiro (clickjacking).

---

## 🟡 MEDIO

### M1. `tenant_role_permissions`: lista de todos os tenants para qualquer usuario logado

**Status (2026-09-09):** ✅ **Corrigido**, aplicado no staging **e em producao**. `hub/20260827120000_fix_m1_tenant_role_permissions.sql` revoga o GRANT morto do `anon`, escopa a leitura por `get_current_company_id()` e passa a escrita para `is_super_admin()` com `WITH CHECK` explicito. Fecha tambem o adendo de escrita cross-tenant.

`042_tenant_role_permissions.sql:18-20` cria a policy de SELECT com `using (true)` e `048_fix_dashboard_errors.sql:4` faz `GRANT SELECT ... TO anon`.

**Corrigido pela metade, sem querer.** No banco real a policy e `FOR SELECT TO "authenticated" USING (true)` (`hub/baseline:7239`), entao o `anon` nao le nada apesar do GRANT (`baseline:9331`) — a policy gateia antes. Isso derruba a versao anon do ataque que eu havia descrito.

O que sobra: qualquer usuario logado, de qualquer tenant, faz `select company_id from tenant_role_permissions` e recebe a **lista completa de empresas da plataforma**. Continua sendo a peca que alimenta C3 e C6 (que precisam de um `company_id` valido), so que a partir de uma conta em vez de anonimamente.
**Correcao:** `revoke select ... from anon` (limpar o GRANT morto) e trocar a policy por `using (company_id = get_current_company_id() or is_super_admin())`.

**ADENDO (2026-08-27) — segundo defeito na mesma tabela, nao catalogado acima.** A outra policy, `tenant_role_perms_admin` (`baseline:7233`, nasce em `042:22-29`), e `FOR ALL TO authenticated` com `USING (EXISTS ... role IN ('super_admin','admin'))` e **sem `WITH CHECK`**. Confirmado no staging via `pg_policies`: `cmd = ALL`, `with_check = NULL`. Como o `qual` nao referencia `company_id`, e o Postgres reusa o `USING` como check na ausencia de `WITH CHECK`, qualquer admin de tenant faz UPSERT de override para **qualquer** `company_id` — escrita cross-tenant, mais grave que a leitura do M1. **Correcao:** escrita passa a `is_super_admin()` (o Hub, unico produtor legitimo, roda gated em super_admin — `hub/src/App.tsx:30`; no Veltzy nao ha caminho de escrita) com `WITH CHECK` explicito. Os dois defeitos sao fechados juntos em `hub/.../20260827120000_fix_m1_tenant_role_permissions.sql`.

### M2. `fix-lead-names`: script descartavel em producao com tenant hardcoded

**Status (2026-09-09):** ✅ **Corrigido, depois de uma regressao.** Removida em `2bed9c4`, mas o arquivo **voltou para a arvore da `develop` por merge** e so saiu de vez em `8a96ed4` (09/09), quando o conflito de um outro merge o expos. **Em producao a function nao existe**: conferido em 09/09 por `functions list --project-ref`, `fix-lead-names` nao aparece entre as 44 deployadas. Fica o registro: commit de remocao no historico nao prova ausencia na arvore, e vale reconferir na proxima varredura.

`supabase/functions/fix-lead-names/index.ts:19` — `const companyId = 'd20f7d62-974b-40c4-8f0b-bb8207513554'`. Sem auth, `verify_jwt = false`, e reescreve nomes de leads desse cliente a cada chamada. Deveria ser removido do deploy.

### M3. `whatsapp-manager` sem checagem de role

**Status (2026-09-09):** ✅ **Corrigido e no ar em producao** (deploy de 04/09 10:35, dois minutos depois do commit). `whatsapp-manager` exige admin ou manager nas acoes de conexao (`05e289d`).

`supabase/functions/whatsapp-manager/index.ts:16-27`: exige que exista header `Authorization` e o repassa ao PostgREST, entao **o RLS protege o cross-tenant** — este nao e um furo de isolamento. Mas nao ha checagem de papel: qualquer `seller` da empresa chama `action: 'disconnect'` e derruba o WhatsApp do time inteiro, ou `qrcode` e sequestra a sessao.

### M4. Dependencias vulneraveis

**Status (2026-09-09):** ❌ **Aberto.** `npm audit` em 09/09 devolve 16 vulnerabilidades (1 low, 7 moderate, 8 high). `undici` entrou na lista desde a varredura e tem correcao por `npm audit fix`. `xlsx` continua sem versao corrigida no npm, e segue recebendo planilha enviada por usuario no import de leads.

```
react-router 7.12.0–7.18.1   HIGH   CSRF bypass em RSC mode      → npm audit fix
postcss <=8.5.22             MOD    leitura de .map arbitrario   → npm audit fix
xlsx *                       HIGH   prototype pollution + ReDoS  → sem fix no npm
```
`xlsx` importa planilha enviada pelo usuario (import de leads), entao o prototype pollution tem caminho de entrada real. O npm nao tem versao corrigida: precisa migrar para o tarball oficial `https://cdn.sheetjs.com/xlsx-0.20.x/xlsx-0.20.x.tgz` ou trocar a lib.

### M5. `GRANT SELECT ON ALL TABLES IN SCHEMA veltzy TO anon`

**Status (2026-09-09):** ✅ **Corrigido no staging, ❌ ainda nao em producao.** `hub/20260904120000_fix_m5_m10_revoke_anon_grants.sql` faz `REVOKE ALL ON ALL TABLES IN SCHEMA veltzy FROM anon`. Conferido em 09/09 por `migration list --project-ref`: a migration **nao consta em producao**. A bomba foi desarmada so no staging; em producao os GRANTs do `anon` seguem de pe, e com eles a exposicao do M9.

`010_central_migration.sql:608`. Hoje inofensivo — verifiquei que **as 31 tabelas do schema `veltzy` tem RLS habilitado** e as policies sao `TO authenticated`, entao `anon` nao le nada. Mas e uma bomba armada: a primeira tabela que subir sem policy vira leitura publica. O comentario ("Also grant to anon for Edge Functions") esta errado — Edge Functions usam service_role.

### M6. Politica de senha inconsistente

**Status (2026-09-10):** 🟠 **Corrigido no codigo (develop), falta deployar e configurar o Auth hospedado.**

O achado dizia "front valida 8, `config.toml` diz 6". A correcao de 10/09 mostrou que o problema era maior e morava em outro lugar: **as duas portas reais de criacao de conta sao edge functions do Hub usando a Admin API**, e nenhuma aplicava a politica.

| Porta | Antes | Agora |
|---|---|---|
| `provision-company` (cadastro publico, `--no-verify-jwt`) | qualquer senha nao vazia virava conta | 4 regras no servidor, recusa com `SENHA_FRACA` (422) |
| `accept-invite` (convite do Veltzy) | so comprimento: `aaaaaaaa` passava chamando a funcao direto | 4 regras no servidor |
| Cadastro do Hub (front) | so `min(8)` | 4 regras e checklist, igual ao Veltzy |
| Login do Veltzy (front) | `min(8)`, que barrava quem tinha senha antiga de 6 ou 7 caracteres aceita pelo servidor | `min(1)`: login nao aplica politica de criacao |
| `veltzy/supabase/config.toml` (dev local) | 6, sem requisitos | 8, `lower_upper_letters_digits` |

A regra e uma so: 8 caracteres, maiuscula, minuscula e numero, que e exatamente o `lower_upper_letters_digits` do Auth. Vive em tres copias, porque repos e runtimes diferentes nao compartilham arquivo: `veltzy/src/lib/password-rules.ts`, `hub/src/lib/password-rules.ts` e `hub/supabase/functions/_shared/password-policy.ts`. O teste Deno `password-policy_test.ts` importa a copia do front do Hub e falha se ela divergir do servidor. Entre Veltzy e Hub nao ha teste possivel, so os comentarios cruzados nos tres arquivos.

**O que falta, nesta ordem:**

1. Deployar `provision-company` e `accept-invite`. O merge nao deploya edge function.
2. **Avisar o Lemya.** O projeto de Auth e o mesmo, e o front do Lemya nao esta nos repos auditados: se ele deixar criar ou trocar senha mais fraca, vai passar a receber `weak_password` do servidor depois do passo 3.
3. Configurar a politica no Auth **hospedado**, staging e depois producao: comprimento minimo 8 e requisito `lower_upper_letters_digits`. E a unica camada que cobre o `signUp` feito direto com a anon key, que nao passa por front nem por edge function: `/auth/v1/settings` confirma `disable_signup = false` no staging. O valor atual **segue nao conferido**, porque o endpoint publico de settings nao expoe a politica de senha e ela so se le no dashboard ou na Management API com token.

A politica do Auth vale quando a senha e definida (cadastro e troca), entao ligar o passo 3 nao invalida senha existente.

`login-form.tsx:14` usa `min(8)`, mas `supabase/config.toml:170` tem `minimum_password_length = 6` e `password_requirements = ""`. O config.toml e o template local (nao reflete o projeto hospedado), entao o valor real precisa ser conferido no dashboard. Validacao no client nao vale nada sozinha: `auth.signUp` aceita o que o servidor Supabase aceitar.

### M7. Sem rate limiting proprio e sem timeout de sessao

**Status (2026-09-09):** ❌ **Aberto.** Nada implementado. O `log_auth_event` do M8 introduz um teto por ip para a escrita anonima de auditoria, mas isso e limite de uma RPC, nao rate limiting do produto nem timeout de sessao.

Nenhum controle de taxa nas Edge Functions publicas (agrava A5 e C5). Sessoes nao expiram por inatividade — pendencia M1 do audit de abril.

### M8. `auth_audit_log` aceita INSERT anonimo irrestrito

**Status (2026-09-09):** 🟠 **Escrito, nao aplicado.** Faseado em tres:

1. `hub/20260909130000_fix_m8_auth_audit_rpc_phase1.sql` cria `public.log_auth_event`, que deriva `user_id` de `auth.uid()`, carimba `ip_address` e `user_agent` do request, valida o `event` contra o catalogo dos 11, limita o `metadata` a 4000 caracteres e barra rajada anonima por ip. **Nao aplicada.**
2. Veltzy `9797127` (`src/lib/audit.ts`): o front chama a RPC. Ja esta na `develop`, **nao deployado**. Tem fallback para `PGRST202`, entao subir antes da fase 1 nao perde evento.
3. `hub/20260909140000_fix_m8_auth_audit_lock_insert_phase3.sql` derruba as policies de INSERT e revoga o GRANT do `anon`. **So depois do deploy da fase 2**, senao o log para de receber em silencio.

**Confirmado no banco:** `hub/baseline:7070` + `:9271`
```sql
CREATE POLICY "auth_audit_insert_anon" ON "public"."auth_audit_log"
  FOR INSERT TO "anon" WITH CHECK (true);
GRANT SELECT,INSERT,... ON TABLE "public"."auth_audit_log" TO "anon";
```
A intencao e legitima (registrar login falhado antes de existir sessao — foi o que a `025_fix_audit_log_anon_insert.sql` do Veltzy fez). Mas o `WITH CHECK (true)` nao restringe nada: qualquer pessoa com a anon key insere linhas arbitrarias, com `user_id`, `company_id`, `event`, `ip_address` e `user_agent` que ela mesma escolhe (baseline:2912-2921).

Duas consequencias: **o log de auditoria nao serve como prova forense** (qualquer entrada pode ter sido forjada, e `ip_address`/`user_agent` sao preenchidos pelo cliente ate no uso legitimo), e e um canal de escrita ilimitada no banco sem autenticacao.
A leitura esta protegida (`auth_audit_select_super`, `USING (is_super_admin())`), entao nao ha vazamento.
**Correcao:** mover a escrita para uma RPC `SECURITY DEFINER` que carimba `ip`/`user_agent` do request e limita os valores de `event`, ou uma Edge Function com rate limit. Revogar o INSERT direto do `anon`.

### M9. Tabelas de backup de leads sem RLS

**Status (2026-09-09):** 🟠 **Escrito, nao aplicado.** `hub/20260909120000_fix_m9_backup_tables_rls.sql` liga RLS nas duas tabelas sem criar policy (so quem tem BYPASSRLS le) e revoga `anon`/`authenticated`. E idempotente: pula a tabela que ja tiver sido descartada. **Nao substitui o descarte**, que segue agendado para 12/11/2026 e 15/11/2026.

**Confirmado:** `hub/20260814105318_drop_lead_business_columns.sql:64` e `20260817143000_drop_lead_pipeline_id.sql:57`

```sql
CREATE TABLE "veltzy"."leads_col_backup_20260814" AS SELECT id, company_id, stage_id, status::text, deal_value FROM veltzy.leads;
CREATE TABLE "veltzy"."leads_pipeline_backup_20260817" AS SELECT id, company_id, pipeline_id FROM veltzy.leads;
```

`CREATE TABLE AS` nao herda RLS nem GRANT. Sao as **unicas duas tabelas sem RLS** em todo o banco (99 das 101 tem). Contem dados de todos os tenants juntos, incluindo `deal_value`.

Credito onde e devido: as duas migrations restringiram deliberadamente as colunas copiadas, com a justificativa de LGPD art. 6 III escrita no proprio arquivo — nao ha nome, telefone nem email ali. E o risco hoje esta contido: verifiquei que nao existe **nenhum** `ALTER DEFAULT PRIVILEGES` no banco, e nao ha GRANT nessas tabelas, entao o PostgREST nega antes da RLS.

O problema e a combinacao com M5: um unico `GRANT SELECT ON ALL TABLES IN SCHEMA veltzy TO ...` — exatamente o que a `010_central_migration.sql:607-608` do Veltzy ja fez uma vez — publica as duas na hora. Sao a vitima concreta da bomba armada.
**Correcao:** ligar RLS nas duas (`ENABLE ROW LEVEL SECURITY` sem policy ja basta para uma tabela que so o `service_role` deve ler) e cumprir os descartes ja agendados: 12/11/2026 e 15/11/2026.

### M10. `permissions` e `role_permissions` legiveis por `anon`

**Status (2026-09-09):** ✅ **Corrigido no staging, ❌ ainda nao em producao.** Mesma migration do M5, `hub/20260904120000`, que revoga `permissions` e `role_permissions` do `anon`, e que **nao consta em producao**.

`hub/baseline:7167,7177` — `FOR SELECT USING (true)` sem clausula `TO`, com `GRANT SELECT ... TO anon` (`:9301,9307`). Sao catalogos globais de chaves de permissao, nao tem dado de cliente, entao o impacto e baixo: expoe o mapa de capacidades do produto para quem quiser estudar a superficie. Fica registrado por consistencia — nao ha motivo para o `anon` ler.

---

## O que MELHOROU desde 2026-04-26

Verificado, com evidencia:

| Achado antigo | Status |
|---|---|
| C1 — rotas `/admin`, `/super-admin`, `/gestao` sem role | ✅ **corrigido** — `App.tsx:99,105,108` usam `requireRole` |
| C2 — `company_invites` SELECT `USING (true)` | ✅ **corrigido** — `013_fix_rls_policies.sql` derruba e recria com isolamento |
| C3 — `support_tickets` INSERT `WITH CHECK (true)` | ✅ **corrigido** — mesma migration |
| C4 — `instagram-oauth` sem auth | ✅ **corrigido** — `instagram-oauth/index.ts:18-27` valida token e compara `profile.company_id !== companyId` |
| C5 — CORS `*` em todas | 🟠 **parcial** — allowlist criada em `_shared/cors.ts`, adotada em 3 de 25 |
| C6 — credenciais em plaintext | ❌ **aberto** (A7) |
| C7 — senha `min(6)` | 🟡 **parcial** — front subiu para 8, servidor a confirmar (M6) |
| C8 — role `representative` fora do enum | ✅ **corrigido** — `013:...ALTER TYPE app_role ADD VALUE` |

Tambem verificado e **sem problema**: nenhum segredo commitado (`.env` no gitignore, zero JWT/`sk-`/`AIza` em arquivos rastreados); RLS habilitado em **todas** as 26 tabelas `public` e **todas** as 31 tabelas `veltzy`; todas as 61 funcoes `SECURITY DEFINER` tem `SET search_path`; nenhum `dangerouslySetInnerHTML`, `innerHTML` ou `eval` no front; nenhum log de token ou segredo nas Edge Functions; `activeCompanyId` do localStorage e validado contra a lista de empresas do usuario (`auth.store.ts:169-170`).

---

## Conferencia contra o Hub/Central

O Hub tem um baseline que e `pg_dump` do banco real (2026-07-19), 31 migrations depois dele e 38 arquivadas. Isso permitiu confirmar no estado real o que antes era leitura de migration.

**Nenhum dos achados criticos foi corrigido no Hub.** As 31 migrations pos-baseline nao tocam em `invitations`, `user_roles`, `tenant_role_permissions` nem `accept_invitation` — grep por policy/grant/function nesses objetos volta vazio.

| Achado | Estado no banco real |
|---|---|
| C1 — `invitations` SELECT aberto | ❌ aberto, e **pior**: `baseline:7107` nao tem clausula `TO`, e `:9289` da SELECT ao `anon` |
| C1 — `accept_invitation` sem `auth.uid()` | ❌ aberto, `baseline:516-575` identica a versao do Veltzy |
| C2 — `user_roles` sem `WITH CHECK` | ❌ aberto, `baseline:7001` |
| M1 — `tenant_role_permissions` | 🟡 policy e `TO authenticated`, entao o `anon` nao le — mas todo usuario logado le todos os tenants |
| A7 — credenciais em plaintext | 🟡 Vault existe e funciona, aplicado so as chaves de IA; 4 tabelas ainda em texto claro |
| A3 — policies do Storage | ❌ ausentes nos dois repos; o Hub versiona o bucket `iris-docs` direito, o `chat-attachments` ficou de fora |

**O que a conferencia confirmou como saudavel** (antes eu so podia inferir das migrations):

- **RLS em 99 de 101 tabelas do banco**: 25/25 em `public`, 33/33 em `veltzy`, 41/41 em `lemya`. As duas excecoes sao as tabelas de backup do M9.
- Somente 6 policies com `USING (true)` no banco inteiro, e ja estao todas cobertas acima (C1, M1, M8, M10).
- As policies `FOR ALL` sem `WITH CHECK` do schema `lemya` **nao** tem o defeito do C2: todas amarram `company_id` no predicado.
- `get_user_id_by_email` so tem EXECUTE para `service_role` — nao da para converter email em UUID de fora.
- Nenhum `ALTER DEFAULT PRIVILEGES` no banco, o que contem o M9 e limita o alcance do M5.

**Contexto novo que muda a leitura do risco:** o Central e compartilhado. Alem de `public` e `veltzy`, roda o schema `lemya` (41 tabelas de outro produto) e o control-plane de IA com o Vault. O `super_admin` do C2 nao e um papel do Veltzy — e bypass de RLS nos tres. Priorizar o C2 pelo impacto no Veltzy subestima o que ele alcanca.

---

## Ordem de correcao sugerida

> **Desatualizada.** Esta era a ordem proposta em 2026-08-24 e esta quase toda
> cumprida: os itens 1 a 9 e o 11 sairam. O que resta desta lista e o item 10
> pela metade (A2; o A3 saiu), o 12 (M4), o 13 (A7, com a premissa corrigida),
> o 14 (M9, escrito e nao aplicado) e o 15. A fila viva esta em
> [Estado da correcao](#estado-da-correcao-2026-09-09).

> Migrations para `public.*`, `veltzy.*` e `lemya.*` vao no repo do **Hub**, nao em `veltzy/supabase/migrations/`.

**Hoje (a cadeia de takeover):**
1. C1 — `REVOKE SELECT,INSERT,UPDATE ON public.invitations FROM anon` + policy de SELECT por token + `accept_invitation` usando `auth.uid()` e conferindo email
2. C2 — reescrever a policy `"Admins can manage roles"` com `WITH CHECK` e escopo de company. Enquanto nao sair, `cloud_api_credentials.access_token` esta a um INSERT de distancia de qualquer admin de cliente
3. M1 — restringir a policy de `tenant_role_permissions` a empresa do usuario

**Esta semana (Edge Functions abertas):**
4. C3, C4, C6, A1 — aplicar o padrao de `whatsapp-send:56-73` (getUser → profile.company_id, ignorar o do body)
5. C5 — autenticar `send-invite-email` e escapar o HTML
6. A5 — `CRON_SECRET` nas cinco funcoes de cron
7. M2 — remover `fix-lead-names` do deploy

**Proximas duas semanas:**
8. A4 — assinatura nos tres webhooks restantes
9. A6 — trocar `corsHeaders` por `getCorsHeaders(req)` nas 22 funcoes e apagar o export wildcard
10. A2 + A3 — bucket privado com signed URL, policies do Storage versionadas em migration
11. A8 — headers de seguranca no `vercel.json`
12. M4 — `npm audit fix` e plano para o `xlsx`

**Backlog:**
13. A7 — portar as 4 tabelas restantes para o Vault, reusando os wrappers de `hub/20260804151000_ai_secret_wrappers.sql`. Comecar por `cloud_api_credentials`, que e a unica legivel via PostgREST
14. M9 — ligar RLS nas duas tabelas de backup e cumprir os descartes de 12/11 e 15/11/2026
15. M3, M5, M6, M7, M8, M10

---

## Limites desta varredura

Para nao repetir o erro de reportar como resolvido o que nao foi verificado:

- **Tudo aqui e analise estatica dos repositorios.** Nao executei nenhum ataque contra o staging nem contra producao. Os achados sao explicaveis linha a linha, mas nenhum foi *demonstrado* rodando.
- **O estado do banco vem do baseline do Hub, nao de uma consulta minha.** O `00000000000000_baseline.sql` e um `pg_dump`, o que e forte — mas e um retrato de **2026-07-19**. Cobri o intervalo lendo as 31 migrations posteriores, entao qualquer mudanca feita direto pelo dashboard depois dessa data nao aparece aqui. Um `SELECT * FROM pg_policies WHERE tablename IN ('invitations','user_roles')` no staging fecha essa lacuna em um minuto — e voce quem consegue rodar.
- **As policies de `storage.objects` do `chat-attachments` nao existem em nenhum dos dois repos** (A3), e `pg_dump` nao inclui o schema `storage`. O risco de escrita cross-tenant no bucket segue **nao verificado** — pode ser inofensivo ou pode ser critico, so o dashboard responde.
- **`supabase/config.toml` e o template de dev local.** `verify_jwt` por funcao esta declarado la e foi usado como fonte, mas os valores de auth do projeto hospedado (tamanho minimo de senha, signup aberto, URLs de redirect) precisam ser conferidos no dashboard.
- **A migration `010_central_migration.sql` e historica.** O schema `veltzy` vive no Central/Hub; correcoes de RLS nessas tabelas vao na migration do Hub, nao em `supabase/migrations/` do Veltzy. O mesmo vale para `public.*`: apesar de as policies de C1 e C2 terem nascido em migrations do Veltzy, a correcao vai no Hub.
- **Nao auditei o produto `lemya`.** Ele aparece aqui so onde toca o Veltzy (mesmo banco, mesmo `super_admin`). As 41 tabelas dele merecem varredura propria.
