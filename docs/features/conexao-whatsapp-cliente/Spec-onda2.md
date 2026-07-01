# Spec - Onda 2: Embedded Signup oficial ponta a ponta com token por WABA

**PRD:** `docs/features/conexao-whatsapp-cliente/PRD.md` (secao 8, Onda 2).
**Escopo:** cross-repo. Veltzy (frontend + edge intermediaria) e Hub (edge de troca de token + persistencia + ajuste no envio).
**Esta Spec cobre:** o Embedded Signup da Meta de verdade (SDK client-side, captura de code + IDs, troca de code por token no Hub, persistencia do token por WABA, e o envio passando a resolver token por numero).
**Status:** Spec pronta. Nao implementar nesta etapa.

---

## 1. Resumo

A Onda 1 entregou a tela de escolha de categoria (`WhatsAppConnectChoice`) com a categoria `official` como placeholder desabilitado (`available: false` em `src/lib/whatsapp-categories.ts`). Esta Onda liga o fluxo oficial de verdade:

1. O cliente (admin da empresa) clica em "Conectar" no card "WhatsApp API Oficial".
2. Abre o popup do Embedded Signup da Meta (Facebook JS SDK + `FB.login` com `config_id`).
3. O cliente loga no Facebook dele, escolhe a WABA e o numero.
4. O app captura o `code` (via `authResponse`) e o `waba_id` + `phone_number_id` (via mensagem do popup).
5. O Veltzy repassa esses dados a uma edge intermediaria, que chama o Hub (m2m).
6. O Hub troca o `code` por um token de sistema da WABA do cliente (usando `META_APP_SECRET`), persiste o token Hub-side e devolve sucesso.
7. O Veltzy grava o numero em `veltzy.cloud_api_numbers` (sem o token).
8. O envio (`cloud-api-send-message` no Hub) passa a resolver o token pelo `phone_number_id`: usa o token por WABA se existir, senao cai para o `META_SYSTEM_USER_TOKEN` global.

O Veltzy NUNCA recebe nem armazena o token da Meta. So dispara o signup e manda IDs + code ao Hub.

---

## 2. Decisao travada desta Onda: token por WABA (muda o PRD original)

O PRD (secao 6.2 item 4 e secao 8, Onda 2) deixava aberto "token global temporario vs token por WABA". **Decisao tomada: token por WABA desde ja**, persistido e usado no envio.

- O fluxo novo de Embedded Signup SEMPRE gera e usa token por WABA.
- O `META_SYSTEM_USER_TOKEN` global continua existindo APENAS como fallback de transicao para numeros que ainda nao tem token proprio (empresas legadas em `cloud_api` que ainda nao reconectaram via Embedded Signup).
- O fallback global e desejavel para nao quebrar quem ja existe, mas NAO e bloqueador: a unica empresa hoje em `cloud_api` por token global e a Stark Tech (`44f69ec0-cf37-44cc-be4c-130930f45f45`), que e empresa de testes, nao cliente real. Nao ha risco de cliente real parar de funcionar.

---

## 3. Decisao de arquitetura: onde mora o token

O PRD (secao 4.2) registra a divida de ownership: `veltzy.cloud_api_numbers` guarda `access_token`, mas token e dado sensivel e arquiteturalmente deveria ser Hub-owned (restricao 4 do PRD: "Hub e dono da credencial; Veltzy so consome").

**Decisao desta Spec:** o token por WABA do Embedded Signup e canonicamente **Hub-owned**, em tabela nova `public.cloud_api_credentials` (schema `public`, Hub-owned). NAO no `veltzy.cloud_api_numbers`.

- `veltzy.cloud_api_numbers` continua guardando apenas dados de roteamento nao sensiveis: `phone_number_id`, `waba_id`, `display_number`, `instance_label`, `status`, `is_default`. Esses nao sao segredos de longa duracao.
- O token novo do Embedded Signup nunca cruza para o Veltzy. Quem grava e le o token e sempre uma edge do Hub com service role.
- A coluna legada `veltzy.cloud_api_numbers.access_token` NAO e removida nesta Onda (ver secao 8, dependencia do inbound de midia). Para numeros conectados via Embedded Signup, ela fica `NULL`; o token vive so no Hub.

Isso resolve a divida do PRD para o caminho novo, sem migrar o dado legado neste pacote.

---

## 4. Pre-requisitos da Meta (dados de entrada, NAO reconfigurar)

Ja resolvidos no painel da Meta. A Spec parte deles.

| Item | Valor |
|------|-------|
| App ID | `1524724456057574` |
| `config_id` (Configuration "Veltzy Embedded Signup") | `1322056199529142` |
| Versao do cadastro incorporado | v4 |
| Versao das informacoes da sessao (`sessionInfoVersion`) | 3 |
| Permissoes da Configuration | `whatsapp_business_management`, `whatsapp_business_messaging` |
| Dominios SDK JavaScript permitidos | `https://app.veltzy.com/`, `http://localhost:5174` |
| App Secret | salvo no Supabase Central como secret `META_APP_SECRET` (Hub) |
| Verificacao da empresa (Business Verification) | aprovada |
| App Review | AINDA NAO submetido (app em modo dev, suficiente para sandbox) |
| Versao da Graph API em uso | `v25.0` (confirmado em `cloud-api-send-message`, constante `GRAPH_API_VERSION`) |

App ID e `config_id` sao valores publicos (vao no client-side). App Secret e segredo, fica so no Hub.

---

## 5. Frontend (Veltzy): fluxo client-side do Embedded Signup

### 5.1 Constantes publicas

Novo arquivo: `src/lib/meta-embedded-signup.ts` (constantes do fluxo, sem segredo).

```ts
export const META_APP_ID = '1524724456057574'
export const META_ES_CONFIG_ID = '1322056199529142'
export const META_GRAPH_VERSION = 'v25.0' // casar com GRAPH_API_VERSION do Hub
export const META_SESSION_INFO_VERSION = 3
```

Opcional: ler `META_APP_ID`/`META_ES_CONFIG_ID` de `import.meta.env` (`VITE_META_APP_ID`, `VITE_META_ES_CONFIG_ID`) para permitir app de teste diferente em dev. Como sao valores publicos, hardcodar a constante e aceitavel; a Spec deixa a escolha para a implementacao seguir o padrao de envs do repo.

### 5.2 Loader do Facebook JS SDK

Novo arquivo: `src/lib/facebook-sdk.ts` (carregamento idempotente do SDK).

Responsabilidades:
- Injetar `https://connect.facebook.net/en_US/sdk.js` uma unica vez (guard por id do script ou flag global).
- Chamar `FB.init({ appId: META_APP_ID, autoLogAppEvents: true, xfbml: false, version: META_GRAPH_VERSION })` no `fbAsyncInit`.
- Expor `loadFacebookSdk(): Promise<void>` que resolve quando `window.FB` esta pronto.
- Tipagem: declarar `window.FB` e `window.fbAsyncInit` (evitar `any`, usar tipo minimo de apoio conforme convencao do repo).

### 5.3 Captura da sessao (postMessage)

O Embedded Signup entrega dois pedacos por canais diferentes (padrao Meta, `sessionInfoVersion: 3`):

1. **`code`** vem no callback de `FB.login`, em `response.authResponse.code`.
2. **`waba_id` + `phone_number_id`** vem por `window` message do popup da Meta.

Formato da mensagem da sessao (conferir com a doc oficial vigente na implementacao; shape esperado):
- `event.origin` deve ser `https://www.facebook.com`.
- `event.data` e uma string JSON. Apos `JSON.parse`, tem `type === 'WA_EMBEDDED_SIGNUP'`.
- Em `data.event === 'FINISH'`, `data.data` contem `{ phone_number_id, waba_id }`.
- Tratar tambem `data.event === 'CANCEL'` (cliente fechou) e `data.event === 'ERROR'`.
- Ignorar e nao confiar em mensagens de outras origens.

A captura do message listener e do `code` precisa ser correlacionada: registrar o listener ANTES de chamar `FB.login`, guardar `waba_id`/`phone_number_id` em ref/estado, e so disparar o onboarding quando tiver `code` + `waba_id` + `phone_number_id`. Remover o listener ao desmontar.

### 5.4 Chamada de `FB.login`

```ts
FB.login(callback, {
  config_id: META_ES_CONFIG_ID,
  response_type: 'code',
  override_default_response_type: true,
  extras: { sessionInfoVersion: META_SESSION_INFO_VERSION },
})
```

No `callback`, ler `response.authResponse?.code`. Sem `code` = cliente cancelou ou falhou: ir para estado de erro/cancelado.

### 5.5 Componente novo do fluxo oficial

Novo arquivo: `src/components/admin/whatsapp-embedded-signup.tsx`.

Maquina de estados (espelha o padrao de `whatsapp-connect-dialog.tsx`, sem reusar a logica de QR):
- `idle`: botao "Conectar numero oficial".
- `loading`: SDK carregando / popup aberto / aguardando code + sessao.
- `exchanging`: chamando a edge de onboarding (troca de token + gravacao).
- `connected`: sucesso, mostra o numero conectado (`display_number` ou label neutro).
- `cancelled`: cliente fechou o popup (mensagem neutra, permite tentar de novo).
- `error`: falha no popup, na troca de token, ou conflito de numero ja em uso (mensagem neutra + tentar de novo).

Regras de UI (App Review, restricao 3 do PRD e secao 2 da Spec-onda1):
- Labels NEUTROS. Nunca exibir "Meta", "Cloud API", "Facebook" como nome tecnico do produto ao cliente. Pode dizer "WhatsApp" e "numero oficial". (O SDK e o popup sao da Meta; o popup em si e da Meta e isso e inerente ao Embedded Signup, mas o nosso texto de UI fica neutro.)
- Gating por role igual ao resto: `useRoles().isAdmin` (admin/super_admin), mesmo padrao de `WhatsAppInstances`.
- Erro de `phone_number_id` ja cadastrado por outra empresa: mensagem neutra "Este numero ja esta conectado. Fale com o suporte." (o `phone_number_id` e UNIQUE; ver secao 7).

### 5.6 Ligacao na tela de escolha

Editar `src/components/admin/whatsapp-connect-choice.tsx`:
- Hoje, ao selecionar `official`, nao ha branch (card desabilitado). Adicionar branch `selected === 'official'` que renderiza `<WhatsAppEmbeddedSignup />` com botao "Voltar", espelhando o branch de `qr_code`.
- O card `official` so vira clicavel quando `WHATSAPP_CATEGORIES.official.available === true` (ver secao 9: o flip da flag e o ultimo passo, depois de testado).

---

## 6. Backend Veltzy: edge intermediaria `cloud-api-onboard`

Novo arquivo: `supabase/functions/cloud-api-onboard/index.ts`. Segue o padrao de `whatsapp-instance-manage` (valida JWT + role, resolve `company_id` do profile, repassa ao Hub m2m).

Responsabilidades:
1. CORS + OPTIONS (mesmo helper local de `whatsapp-instance-manage`, incluir `http://localhost:5174` no allowlist de origens, ja que e o dominio de dev do Embedded Signup).
2. Autenticar via JWT do usuario, exigir role `admin` ou `super_admin` (reusar a logica de `authenticateAndAuthorize`).
3. Resolver `company_id` pelo profile do usuario (nunca confiar em `company_id` vindo do body).
4. Receber do body: `code`, `waba_id`, `phone_number_id`, opcional `display_number`.
5. Chamar o Hub `cloud-api-onboard` (m2m, `Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY`, mesmo padrao do provider `cloud-api.ts`), passando `{ code, waba_id, phone_number_id, company_id }`. O Hub faz a troca de token e persiste Hub-side. O Veltzy NUNCA chama a Graph API para trocar token.
6. Se o Hub retornar sucesso, gravar/upsert em `veltzy.cloud_api_numbers`:
   - `company_id`, `phone_number_id` (UNIQUE), `waba_id`, `display_number`, `instance_label` (default = `display_number` ?? `phone_number_id`), `status = 'active'`.
   - `access_token` fica `NULL` (token vive no Hub).
   - `is_default = true` se for o primeiro numero ativo da empresa (respeitar o unique parcial de `is_default` da migration 069).
7. Tratar conflito de `phone_number_id` ja existente (numero ja conectado): devolver erro claro 409 para o front renderizar a mensagem neutra.
8. Nunca logar `code` nem token.

Nota de seguranca: o Veltzy usa service role para escrever em `veltzy.cloud_api_numbers` (RLS de escrita exige admin/manager da empresa; a edge ja validou role e ownership por `company_id`).

---

## 7. Backend Hub: troca de code por token + persistencia

### 7.1 Edge nova `cloud-api-onboard` (Hub)

Novo arquivo (Hub): `supabase/functions/cloud-api-onboard/index.ts`. Espelha o guard m2m de `cloud-api-send-message` (so `service_role`, via `authenticateUser` de `_shared/evolution-proxy.ts`).

Fluxo:
1. Guard m2m: so aceita chamada `service_role` (mesmo padrao de `cloud-api-send-message`).
2. Receber `{ code, waba_id, phone_number_id, company_id }`. Validar presenca de todos.
3. **Trocar o code por token** via Graph API:
   ```
   GET https://graph.facebook.com/v25.0/oauth/access_token
       ?client_id=<META_APP_ID>
       &client_secret=<META_APP_SECRET>
       &code=<code>
   ```
   - `META_APP_SECRET`: secret ja existente no Hub.
   - `META_APP_ID`: adicionar como secret/env do Hub (`META_APP_ID = 1524724456057574`), ou constante. Valor publico, mas centralizar como env evita divergencia.
   - A resposta traz `access_token` (token de sistema da WABA do cliente via Embedded Signup, sem expiracao curta).
4. (Recomendado, conferir necessidade no fluxo sandbox) garantir que o app esta inscrito na WABA e o numero registrado:
   - `POST /v25.0/<waba_id>/subscribed_apps` (assina os webhooks do app na WABA do cliente).
   - Registro do numero (`POST /v25.0/<phone_number_id>/register` com PIN) pode ser necessario para numeros reais; para sandbox normalmente ja vem pronto. Documentar como passo condicional, tratar erro sem abortar a persistencia do token.
5. **Persistir** em `public.cloud_api_credentials` (DDL na secao 10): upsert por `phone_number_id` com `company_id`, `waba_id`, `access_token`, `token_source = 'embedded_signup'`, `status = 'active'`.
6. Responder `{ success: true }` ao Veltzy. NUNCA devolver o token no corpo.
7. Nunca logar `code` nem `access_token`.

### 7.2 Ajuste no envio: `cloud-api-send-message` resolve token por numero

Editar (Hub): `supabase/functions/cloud-api-send-message/index.ts`.

Hoje (linha 52) usa sempre `Deno.env.get('META_SYSTEM_USER_TOKEN')`. Passa a resolver:

1. Buscar credencial por `phone_number_id`:
   ```sql
   SELECT access_token
   FROM public.cloud_api_credentials
   WHERE phone_number_id = $1 AND status = 'active'
   LIMIT 1;
   ```
2. Se encontrou: usar `access_token` da WABA (caminho Embedded Signup).
3. Se nao encontrou: cair para `META_SYSTEM_USER_TOKEN` global (compatibilidade com Stark Tech e qualquer numero ainda nao reconectado).
4. Se nao tem nenhum dos dois: erro 500 claro "Token da Cloud API nao configurado" (comportamento atual preservado).
5. Logar apenas QUAL caminho foi usado (`per_waba` vs `global`), NUNCA o token.

Como o resolver decide (documentado): **por WABA se existir linha em `cloud_api_credentials` para o `phone_number_id`; fallback pro global se nao existir ainda.** A migracao suave acontece sozinha: enquanto a empresa nao reconecta via Embedded Signup, nao ha linha, e o envio segue no token global.

### 7.3 Risco e cuidado (codigo de producao que envia mensagem real)

`cloud-api-send-message` ja envia mensagens reais. A mudanca e aditiva e segura: se a query nao acha credencial, o comportamento e identico ao de hoje (token global). O plano de teste (secao 11) valida os dois caminhos antes de qualquer onda futura considerar desligar o fallback. NAO remover o fallback global nesta Onda.

---

## 8. Dependencia cruzada: token no inbound de midia (gap documentado)

O token Cloud API e usado hoje em DOIS lugares:

1. **Outbound** (Hub `cloud-api-send-message`): tratado na secao 7.2.
2. **Inbound de midia** (Veltzy `cloud-api-inbound/index.ts:134`): `const token = resolved.accessToken ?? META_SYSTEM_USER_TOKEN`. Usa `veltzy.cloud_api_numbers.access_token` para baixar a midia via `downloadAndPersistCloudApiMedia` (`_shared/cloud-api-media.ts`).

Com o token movido para o Hub, numeros conectados por Embedded Signup terao `cloud_api_numbers.access_token = NULL`. O inbound entao cai no `META_SYSTEM_USER_TOKEN` global para baixar midia. Isso funciona se o numero estiver sob a mesma Business Manager do app; para WABA de cliente em BM propria, o token global pode nao ter permissao de baixar a midia daquele numero.

**Decisao desta Onda:** nao resolver o download de midia por token-por-WABA agora. Justificativa:
- O foco travado da Onda 2 e o Embedded Signup + token por WABA no ENVIO.
- A validacao desta Onda usa conta sandbox com a Stark Tech (empresa de teste); midia recebida nao esta no caminho critico do teste de fluxo.
- Mexer no inbound exigiria ou (a) duplicar o token no Veltzy (fere "Veltzy nunca detem o token"), ou (b) um proxy de midia Hub-side, que e escopo proprio.

**Encaminhamento (fora desta Onda, registrar como divida):** quando o inbound de midia de numeros em BM propria for necessario, criar uma edge Hub `cloud-api-media-token` (ou proxy de download) que o Veltzy chama para obter bytes da midia, mantendo o token Hub-side. Recomendado: proxy de download no Hub (nao expor o token nem temporariamente). Texto e demais tipos sem midia nao sao afetados.

---

## 9. Flip da categoria `official` (ultimo passo, NAO agora)

`src/lib/whatsapp-categories.ts`: trocar `available: false` para `available: true` na chave `official` SOMENTE depois do fluxo implementado e testado ponta a ponta (secao 11). Nesta fase de Spec, NAO mexer. O flip e o gatilho que torna o card oficial clicavel para o cliente.

---

## 10. Schema novo (DDL para revisao no Dashboard, NAO aplicar)

Tabela Hub-owned para o token por WABA. Aplicar manualmente no SQL Editor do Dashboard apos revisao (banco compartilhado; proibido CLI de migration). Arquivo sugerido no Hub: `supabase/migrations/<timestamp>_cloud_api_credentials.sql`.

```sql
-- Hub-owned. Token de sistema da WABA do cliente (Embedded Signup).
-- Sensivel: nenhuma policy para authenticated => so service_role (edge) acessa.
CREATE TABLE IF NOT EXISTS public.cloud_api_credentials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL UNIQUE,          -- chave de resolucao no envio
  waba_id         text NOT NULL,
  access_token    text NOT NULL,                 -- token de sistema da WABA (Embedded Signup)
  token_source    text NOT NULL DEFAULT 'embedded_signup'
                    CHECK (token_source IN ('embedded_signup', 'system_user_global')),
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'revoked')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cloud_api_credentials_phone_number_id
  ON public.cloud_api_credentials (phone_number_id);
CREATE INDEX IF NOT EXISTS idx_cloud_api_credentials_company
  ON public.cloud_api_credentials (company_id);

ALTER TABLE public.cloud_api_credentials ENABLE ROW LEVEL SECURITY;
-- Sem policy de SELECT/INSERT/UPDATE para `authenticated`: nenhum JWT (nem super_admin)
-- le o token. Apenas edges com service_role (que ignora RLS) acessam. O painel do Hub
-- mostra status/metadata a partir de `veltzy.cloud_api_numbers`, nao desta tabela.

COMMENT ON TABLE public.cloud_api_credentials IS
  'Token de sistema da WABA por numero (Embedded Signup). Hub-owned, sensivel. Resolvido no envio por phone_number_id; fallback META_SYSTEM_USER_TOKEN.';
```

Hardening recomendado (fora desta Onda, registrar): migrar `access_token` para Supabase Vault (`vault.secrets`) ou cifrar com `pgcrypto`. Nao ha Vault/pgsodium nas migrations atuais; por ora o RLS lockdown (nenhuma policy para authenticated + acesso so service_role) e a protecao. Registrar a divida.

**Sem outra alteracao de schema.** `veltzy.cloud_api_numbers` ja tem todas as colunas necessarias (068/069). `public.companies.whatsapp_categories` ja existe (Onda 0).

---

## 11. Plano de teste com conta sandbox da Meta

Decisao: validar com **conta sandbox** da Meta (App Dashboard > WhatsApp > Quickstart > Testing Integrations > Claim sandbox account), NAO numero real, e usar a **Stark Tech** (`44f69ec0-cf37-44cc-be4c-130930f45f45`, empresa de teste) para reconectar via Embedded Signup e validar o token por WABA ponta a ponta.

### 11.1 Como reivindicar e simular
1. No App Dashboard da Meta, reivindicar a sandbox account (gera uma WABA + numero de teste sob o app, sem custo e sem numero real).
2. Logar no Veltzy como admin da Stark Tech.
3. Garantir que a categoria `official` esta `available: true` (flip da secao 9 ja feito para o teste) e ON na allowlist da Stark Tech (Hub).

### 11.2 Fluxo de validacao
1. **Abrir o signup:** Configuracoes > Integracoes > Canais > card "WhatsApp API Oficial" > Conectar. Esperado: popup do Embedded Signup abre.
2. **Concluir no popup:** escolher a WABA/numero sandbox. Esperado: popup fecha, UI vai para `exchanging` e depois `connected`.
3. **Persistencia Veltzy:** conferir no Dashboard (SQL Editor, leitura) que `veltzy.cloud_api_numbers` tem a linha do numero sandbox com `phone_number_id`, `waba_id`, `status='active'`, `access_token IS NULL`.
4. **Persistencia Hub:** conferir que `public.cloud_api_credentials` tem a linha com `token_source='embedded_signup'`, `status='active'` (NAO inspecionar/expor o token em log).
5. **Envio por WABA:** disparar um envio para o numero de teste e confirmar nos logs do Hub que `cloud-api-send-message` resolveu o caminho `per_waba` (e nao `global`). O numero sandbox so envia para numeros previamente adicionados a allowlist de destinatarios de teste da sandbox (limitacao da sandbox).
6. **Fallback global:** com uma empresa SEM linha em `cloud_api_credentials` (estado pre-reconexao), confirmar que o envio cai em `global` e continua funcionando. Pode ser simulado removendo/nao criando a credencial.
7. **Cancelamento:** abrir o signup e fechar o popup. Esperado: estado `cancelled`, sem linha gravada, permite tentar de novo.
8. **Conflito de numero:** tentar conectar um `phone_number_id` ja existente. Esperado: erro neutro "Este numero ja esta conectado. Fale com o suporte.", sem duplicar.
9. **Assercao App Review (grep):** rodar a varredura de labels neutros incluindo os arquivos novos:
   ```bash
   grep -rniE "evolution|z-?api|cloud[ _-]?api|\bmeta\b|facebook" \
     src/components/admin/whatsapp-embedded-signup.tsx \
     src/components/admin/whatsapp-connect-choice.tsx
   ```
   Esperado: zero ocorrencia de nome tecnico de provider no texto visivel ao cliente. (Nomes de variavel/constante interna como `META_APP_ID` em `src/lib/*` nao sao texto de UI; o foco e copy renderizada.)
10. **Build limpo:** `npm run build` no Veltzy e no Hub sem erros.

### 11.3 Limitacoes da sandbox (registrar)
- A sandbox nao envia para numeros arbitrarios: so para destinatarios de teste adicionados no painel. Nao valida entrega para numero real.
- Midia inbound nao esta no caminho critico (secao 8); nao bloquear o teste por ela.
- Templates/HSM fora de escopo (PRD secao 9).

---

## 12. Checklist remanescente do App Review (quando chegar a hora, NAO agora)

A submissao do App Review nao acontece nesta fase (app em modo dev e sandbox bastam). Quando for promover para numeros reais:

- [ ] Submeter App Review pedindo `whatsapp_business_management` e `whatsapp_business_messaging` (ja sao as permissoes da Configuration).
- [ ] Gravar video demonstrando o Embedded Signup ponta a ponta na empresa de gravacao com APENAS a categoria `official` ON na allowlist (restricao 3 do PRD: nao pode aparecer provider nao oficial no video).
- [ ] Rodar a assercao de grep (secao 11.2 item 9) antes de gravar.
- [ ] Confirmar dominios autorizados de producao alem dos atuais (ja constam `https://app.veltzy.com/` e `http://localhost:5174`; avaliar `https://develop.app.veltzy.com` se for gravar em staging).
- [ ] Confirmar webhook do produto WhatsApp apontando para `cloud-api-inbound` com verify token (`META_VERIFY_TOKEN`) e HMAC (`META_APP_SECRET`) ja configurados.
- [ ] Adicionar `META_APP_ID` como env/secret do Hub (usado na troca de code, secao 7.1).
- [ ] Revisar registro de numero real (`/register` com PIN) que a sandbox dispensa.

---

## 13. Arquivos a criar / editar (caminho exato)

### Veltzy (`/Users/tonimelo/projetos/veltzy`)

**Criar:**
- `src/lib/meta-embedded-signup.ts` (constantes publicas: app id, config id, graph version, session info version).
- `src/lib/facebook-sdk.ts` (loader idempotente do Facebook JS SDK + tipagem de `window.FB`).
- `src/components/admin/whatsapp-embedded-signup.tsx` (componente do fluxo oficial, maquina de estados, labels neutros).
- `src/services/cloud-api-onboard.service.ts` (chamada a edge `cloud-api-onboard`).
- `src/hooks/use-cloud-api-onboard.ts` (mutation React Query do onboarding).
- `supabase/functions/cloud-api-onboard/index.ts` (edge intermediaria: valida role, repassa ao Hub, grava `cloud_api_numbers`).

**Editar:**
- `src/components/admin/whatsapp-connect-choice.tsx` (branch `selected === 'official'` renderiza `<WhatsAppEmbeddedSignup />`).
- `src/lib/whatsapp-categories.ts` (flip `official.available` para `true`, SOMENTE apos teste; secao 9).

### Hub (`/Users/tonimelo/projetos/hub`)

**Criar:**
- `supabase/functions/cloud-api-onboard/index.ts` (troca `code` por token via Graph API com `META_APP_SECRET`, persiste em `cloud_api_credentials`).
- `supabase/migrations/<timestamp>_cloud_api_credentials.sql` (DDL da secao 10, aplicar manualmente no Dashboard apos revisao).

**Editar:**
- `supabase/functions/cloud-api-send-message/index.ts` (resolver token por `phone_number_id` em `cloud_api_credentials`; fallback `META_SYSTEM_USER_TOKEN`).

### Secrets/env a configurar (NAO em codigo)
- Hub: `META_APP_ID` (novo, valor `1524724456057574`). `META_APP_SECRET` e `META_SYSTEM_USER_TOKEN` ja existem.

### Fora de escopo (nao tocar nesta Onda)
- `cloud-api-inbound`, `cloud-api-media.ts` (gap de midia documentado na secao 8, encaminhado).
- Migrar `cloud_api_numbers` para `public` (divida do PRD, frente propria).
- Multi-numero (filtro por numero, SDR por numero, escolha pelo vendedor): Onda 3.
- Templates/HSM e `value.statuses[]`: fora do pacote (PRD secao 9).

---

## 14. Resumo de decisoes (rapido)

| Decisao | Resultado |
|---------|-----------|
| Token global vs por WABA | Por WABA desde ja; global so como fallback de transicao. |
| Onde mora o token novo | Hub-owned, `public.cloud_api_credentials`. Veltzy nunca detem. |
| `veltzy.cloud_api_numbers.access_token` | Fica `NULL` para numeros Embedded Signup; coluna nao removida (inbound de midia). |
| Resolucao no envio | Por `phone_number_id` em `cloud_api_credentials`; fallback `META_SYSTEM_USER_TOKEN`. |
| Inbound de midia por WABA | Fora desta Onda; cai no token global; proxy Hub-side encaminhado. |
| Teste | Conta sandbox + Stark Tech (empresa de teste), reconectando via Embedded Signup. |
| Fallback global | Desejavel, nao bloqueador; sem cliente real em risco. |
| Flip `official.available` | Ultimo passo, so apos teste ponta a ponta. |
