Trilha: G
Início: 2026-11-12 11:58
Merge: (preencher no merge)

# PRD: Eventos no Veltzy (estilo Sympla)

> Feature: `eventos` / Fase 1 (eventos gratuitos)
> Status: rascunho do copiloto, aguardando revisão da Leticia e as validações do Toni listadas na seção 9
> Fontes: `especificacao-eventos.md` (Toni/Mentor) e `referencia-eventos.pdf` (canvas `claude.ai/artifact/VDSAopUq6u2bUysQweLssR`). Os dados das telas são fictícios.
> SPECs: `veltzy/specs/eventos/SPEC.md` (front, Edge Functions, Vercel) e `hub/specs/eventos/SPEC.md` (migration, RLS, funções, storage, cron)

---

## 1. Problema

Empresas clientes do Veltzy fazem eventos (encontros, cafés, webinars) para gerar negócio. Hoje montam a inscrição no Sympla ou num Google Forms, exportam a planilha e importam no CRM depois do evento. O lead esfria, a origem se perde e ninguém sabe quem compareceu.

**O que esta entrega resolve:** o tenant publica a página do evento com a marca dele, cada inscrição vira na hora um negócio na pipeline escolhida, já qualificado pelas respostas do formulário, e o WhatsApp do tenant confirma, lembra e faz o pós-evento sozinho.

## 2. Para quem

| Papel | O que faz |
|---|---|
| admin, manager | cria, edita, publica, despublica, duplica e cancela eventos; vê inscritos e painel |
| seller | vê eventos, inscritos e painel; faz check-in; **não edita evento** |
| super_admin | tudo, em qualquer tenant |
| inscrito (anônimo) | vê a página pública, se inscreve, confirma, cancela, baixa a agenda |

## 3. Estado atual (diagnóstico da seção 2 da especificação)

Conferido em 12/11/2026 no código do Veltzy (`develop`, `4168660`) e no schema do Central (baseline do Hub + migrations datadas até `20261110120000`). Nenhuma consulta foi feita no banco: onde o estado só existe no banco, isso está marcado como **a conferir no staging**.

### 3.1 CRM: pipelines, etapas, negócios, contatos, tags, prioridade, ganho/perdido

- **Contato = `veltzy.leads`.** Tem `UNIQUE (company_id, phone)` (`leads_company_phone_unique`), `email` sem unicidade, `name` + `first_name`/`last_name` mantidos pelo trigger `sync_name_parts` (migration `20261103185136`), `company_name`, `observations`, `tags text[]`, `temperature`, `marketing_opt_out`/`opt_out_at`, `whatsapp_instance_name`, `whatsapp_provider`. Desde 14/08 e 17/08 o contato não tem mais `stage_id`, `status`, `deal_value` nem `pipeline_id`: isso tudo mora no negócio.
- **Drift:** `leads.whatsapp_provider` é lido pelo código, mas não aparece na baseline do Hub; veio da migration legada `073_leads_whatsapp_provider.sql` do Veltzy. **A conferir no staging** (a SPEC do Hub manda checar antes de aplicar).
- **Negócio = `veltzy.deals`.** Colunas: `lead_id`, `name`, `value`, `pipeline_id`, `stage_id`, `assigned_to` (FK `public.profiles.id`), `status` (`open | won | lost | archived | pending_assignment`), `closed_at`, `observations` (desde 22/07), e as de origem `source_id` (FK `lead_sources`), `origin_instance_name`, `origin_ad_id`, `origin_campaign_id`, `origin_utm_campaign`, `routing_rule_id`.
- **Pipelines e etapas:** `veltzy.pipelines` (`is_default`, `is_active`, `sdr_instance_name`) e `veltzy.pipeline_stages` (`pipeline_id`, `position`, `is_final`, `is_positive`).
- **Tags:** ficam **no contato** (`leads.tags text[]`), não no negócio. Desde 10/11 existe o catálogo `veltzy.lead_tags` (`company_id`, `name`, `color`, único por `lower(name)`), que dá cor à tag pelo nome.
- **Prioridade do negócio: não existe.** Não há coluna nem conceito de prioridade em `deals` ou `leads`. O nível mais parecido é `leads.temperature` (`cold | warm | hot | fire`), mas ele **não serve**: `veltzy.recalculate_lead_temperatures()` reescreve a temperatura a partir de `last_customer_message_at`, então qualquer valor gravado pelo evento seria apagado pelo cron.
- **Motivo de perda: não existe.** Perder um negócio é `status = 'lost'` + `closed_at`. Não há coluna de motivo.

### 3.2 `pipeline_sources`: não existe mais

A especificação pede para integrar `pipeline_sources`. **A tabela foi removida em 26/07/2026** (`20260726230000_veltzy_drop_pipeline_sources.sql`) e substituída por `veltzy.pipeline_routing_rules` (`match_type` em `ad_id | campaign_id | utm_campaign | instance | webhook_source`). O resolvedor (`_shared/resolve-pipeline-by-origin.ts`) decide o pipeline das mensagens **inbound** por especificidade, com fallback no pipeline default.

Essa tabela não tem tipo "evento" e não escolhe etapa, só pipeline. O evento já guarda pipeline e etapa de entrada nas próprias colunas, então não há o que rotear. Ver decisão D3.

A origem do negócio é `lead_sources` (catálogo por empresa, com `slug`, `is_system`), gravada em `deals.source_id`.

### 3.3 Normalização de telefone

- Edge: `supabase/functions/_shared/phone.ts`, `normalizePhoneBR`. Front: `src/lib/phone.ts`, mesma função, mais `isValidPhoneBR` (DDD na lista fechada `DDDS_VALIDOS`; celular com 9 dígitos começando em 9 ou fixo com 8 dígitos começando em 2 a 5), `formatPhoneBR` (máscara) e `PHONE_ERROR_MSG`.
- `normalizePhoneBR` só tira o que não é dígito e o zero inicial, e põe `55` na frente quando sobram 10 ou 11 dígitos. **Não mexe no nono dígito.** O `waha-inbound` aceita de 10 a 13 dígitos depois de normalizar.
- **Risco herdado, não criado aqui:** se o WAHA entregar um celular antigo sem o 9 (12 dígitos) e o formulário receber com o 9 (13 dígitos), o mesmo telefone vira dois contatos. A especificação manda reutilizar a mesma regra do Inbox, e é o que fazemos. O risco fica registrado.

### 3.4 Envio pelo WAHA

- Sessões em `public.waha_instances` (`company_id`, `session_name` único, `phone_number`, `status` em `pending | qr_pending | connected | disconnected | error`). RLS por empresa.
- O envio passa pela Edge Function `whatsapp-send` (Veltzy). Ela recebe `leadId` + texto, aceita service role, deriva o provider do lead (`leads.whatsapp_provider`, com fallback no provider ativo da empresa), resolve a instância (`instanceName` explícito > `leads.whatsapp_instance_name` > `pipelines.sdr_instance_name` > `profiles.default_whatsapp_instance`, em `_shared/resolve-instance.ts`) e chama o Hub (`_shared/providers/waha-hub.ts`), que é quem fala com o container WAHA.
- Grava a mensagem em `veltzy.messages` com `instance_name` e `delivery_status` (`sent | failed | pending`), então **a mensagem do evento aparece no Inbox**.
- Instância desconectada: o erro do Hub vira `delivery_status = 'failed'`. A checagem de status antes de enviar não existe no `whatsapp-send`; o dispatcher do evento vai ler `waha_instances.status` antes (ver SPEC).
- Ritmo: o `blast-dispatch` tem throttle próprio (`delay_min/max`, `daily_cap`, janela) em `_shared/blast-schedule.ts`, acoplado a campanha. Não há limitador genérico por instância. O dispatcher do evento implementa os 20 por minuto por sessão.

### 3.5 Inbound e "SAIR"

**Já existe.** `_shared/lead-inbound-handler.ts` (linhas 296 a 307) usa `_shared/optout-detect.ts`: se a mensagem inteira, normalizada, for uma palavra da lista (`sair`, `parar`, `pare`, `cancelar`, `stop`, `descadastrar`, `nao quero receber` e outras), marca `leads.marketing_opt_out = true` e `opt_out_at`. Vale para Z-API, Evolution, WAHA e Cloud API, porque todos passam pelo mesmo handler. Por decisão anterior (Toni/copiloto), **não envia confirmação**: quem pede para sair quer silêncio.

A "lista de descadastrados" é `leads.marketing_opt_out`. O `blast-dispatch`, o `process-cadences` e o `prospect-dm-send` já a respeitam.

### 3.6 Consentimento LGPD no Central

Existe `public.consentimentos` (migration `20260902130000`): `titular_id` **NOT NULL com FK para `auth.users`**, `company_id`, `finalidade`, `termo_versao`, `origem`, `consentido_em`, `revogado_em`. Foi feita para o aceite de quem cria conta. **Não serve para inscrito de evento**, que não é usuário autenticado, e também não tem `texto_aceito` nem `canal`, que o `anexo-lgpd.md` (seção 5.1) exige. Ver decisão D7.

### 3.7 Plano e features

- O gate de funcionalidade é `public.companies.features` (jsonb). O Hub liga e desliga pela aba de feature flags (`hub/src/components/company/feature-flags-tab.tsx`, lista estática de chaves). O Veltzy lê `useAuthStore().company.features` no menu (`app-sidebar.tsx`) e na página; o `ProtectedRoute` aceita `requireFeature`.
- O plano está em `public.subscriptions.plan`, enum `public.subscription_plan` = `trial | starter | pro | enterprise`. O front lê em `auth.store.ts` (`subscriptionPlan`). **Não existe plano "Elite" nem "Profissional" no banco.** Ver decisão D9.

### 3.8 Papéis e helpers de RLS

`public.app_role` = `super_admin | admin | manager | seller | representative`. Helpers no schema `veltzy`: `get_current_company_id()`, `is_super_admin()`, `is_company_admin()`, `is_admin_or_manager()`. Padrão de policy do repo: `company_id = veltzy.get_current_company_id() OR veltzy.is_super_admin()`.

Grants: a migration `20260904120000` fez `REVOKE ALL ON ALL TABLES IN SCHEMA veltzy FROM anon`, mas isso só vale para as tabelas que existiam naquele dia. O baseline não registra `ALTER DEFAULT PRIVILEGES` do schema `veltzy`, então tabela nova pode nascer com grant para `anon`, **a conferir no staging**. A SPEC do Hub revoga explicitamente em cada tabela e função nova, e o critério 19 testa.

### 3.9 Rotas públicas x guard de auth

`src/App.tsx`: as rotas públicas (`/auth`, `/aceitar-convite`, `/privacidade`, `/termos`) ficam fora do `<ProtectedRoute>`, no mesmo `<Routes>`. As de app ficam dentro de um layout protegido. `/e/:slug` e `/e/:slug/i/:token` entram no grupo público.

### 3.10 Bibliotecas instaladas

| Necessidade | Situação |
|---|---|
| Drag and drop | `@dnd-kit/core` + `sortable` (já usados na pipeline) |
| Editor de texto rico | **nenhum** |
| Sanitização de HTML | **nenhuma** (sem DOMPurify) |
| Render de Markdown | `react-markdown` + `remark-gfm` (sem `rehype-raw`, então HTML cru não é renderizado) |
| Máscara de input | **nenhuma lib**; existe `formatPhoneBR` |
| QR code | **nenhuma** |
| Gráficos | `recharts` |
| CSV | `papaparse` |
| Formulário | `react-hook-form` + `zod` |
| CEP | não há integração ViaCEP |

### 3.11 Vercel

`vercel.json` tem só rewrite de tudo para `/index.html` (menos `/assets`) e headers de segurança (`X-Frame-Options: DENY`, CSP `frame-ancestors 'none'; form-action 'self'`). Não há pasta `api/` nem middleware. O Open Graph exige uma Vercel Function nova e um rewrite de `/e/:slug` antes do curinga. Ver D11.

### 3.12 Cron e configuração

- `pg_cron` e `pg_net` estão no baseline (extensões criadas). **A conferir no staging** se continuam habilitadas.
- O padrão vigente de cron HTTP é `cron.schedule` + `net.http_post` com o header montado por `jsonb_build_object` e a chave lida do Vault por `public.ai_secret_read('cron_service_role_key')`. Não há tabela de config: o Vault cumpre esse papel.
- **Armadilha conhecida:** crons com URL de produção escrita na migration rodam no staging contra produção (jobs 8 e 9 do staging). A URL não pode estar fixa na migration.
- As Edge Functions de cron validam com `_shared/cron-auth.ts` (`isCronAuthorized`: service key ou `x-cron-secret`).

### 3.13 Storage

Não há bucket de eventos. O padrão de policy por prefixo de tenant usa `(storage.foldername(name))[1] = public.get_current_company_id()::text` (ver `20260827130000_fix_a3_chat_attachments_policies.sql`).

### 3.14 Política de Privacidade do tenant

**Não existe** campo para a URL da política do tenant (`companies` não tem coluna; `companies.metadata` jsonb não tem chave combinada). A página `/privacidade` do Veltzy é a política do próprio Veltzy, não do tenant. Na Fase 1 a URL é obrigatória por evento, sem pré-preenchimento.

### 3.15 Edge Functions e deploy

As Edge Functions do Veltzy vivem em `veltzy/supabase/functions/`. O CI de deploy delas entrou na `develop` em 12/11 (PR #271); confirmar se já publica no staging antes do bloco (b). Sem CI, o deploy é manual com `npx --yes supabase@2.122.0 functions deploy <nome> --project-ref <ref>`. `db push` continua proibido no Veltzy.

### 3.16 Referências citadas que não vieram nos anexos

- `anexo-lgpd.md`: existe em `Veltz-Group/anexo-lgpd.md` e foi usado (seção 5.1, esquema de consentimento).
- "Template da trilha G": **não existe** na `referencia-tecnica-sdd.md` nem em outro arquivo encontrado. Este PRD usa o cabeçalho da seção 3 da especificação e a estrutura dos PRDs recentes do repo.

## 4. Decisões tomadas

As decisões da seção 4 da especificação (Toni) valem como estão. Abaixo, só o que o diagnóstico obrigou a decidir.

**D1. Contato é `leads`, negócio é `deals`.** "Contact" e "deal" da especificação são esses dois.

**D2. Tags vão para o contato.** A tag do evento e as tags das opções entram em `leads.tags` (união, sem duplicar, comparando sem diferenciar maiúsculas), e a tag do evento é cadastrada em `lead_tags` com a cor primária do evento. `events.event_tag_id` vira `events.event_tag_name text`, porque tag não tem id em `leads.tags`. Consequência: a mesma pessoa em dois eventos fica com as duas tags no mesmo contato, o que é o comportamento certo.

**D3. Sem `pipeline_sources` e sem regra de roteamento.** A pipeline e a etapa de entrada ficam só em `events.pipeline_id`/`entry_stage_id`. Não criamos `pipeline_routing_rules` para evento: aquela tabela decide o pipeline das mensagens inbound, e a inscrição não é mensagem inbound. Mudar a pipeline do evento não move negócios já criados porque a função só lê a configuração no momento da inscrição.

**D4. Origem "Evento" em `lead_sources`.** A migration cria, por empresa, uma `lead_source` de sistema `slug = 'evento'`, `name = 'Evento'`, e a função cria sob demanda se faltar. O negócio recebe `source_id` dessa origem e `origin_utm_campaign`. Ref e as demais UTMs ficam em `event_registrations`, e a tela do negócio mostra a origem completa lendo a inscrição pelo `deal_id`. Ver D6.

**D5. Prioridade: coluna nova `deals.priority` (confirmada pelo Toni em 18/11).** Não existe prioridade no Veltzy e a temperatura é sobrescrita pelo cron (3.1). Proposta: `deals.priority text null check in ('low','medium','high')`, gravada pela inscrição (maior entre as opções escolhidas) e exibida como selo no card do negócio e na tabela de inscritos. Os rótulos ficam "Baixa", "Média" e "Alta", iguais ao PDF. Se o Toni preferir não criar o conceito agora, a prioridade sai da Fase 1 e a qualificação fica só por tag; a migration não depende disso para o resto.

**D6. Respostas no negócio:** a função grava em `deals.observations` um bloco no topo, com o título `Inscrição no evento <título> (<data>)` e uma linha `Rótulo: valor` por resposta. Se já houver texto, o bloco entra antes dele, separado por uma linha em branco. As respostas também ficam em `event_registrations.answers` com o snapshot do rótulo. A tela do negócio ganha um bloco "Evento" com origem, ref, UTMs e respostas, lido da inscrição.

**D7. Consentimento na `veltzy.lead_consents` que já existe.** `public.consentimentos` exige usuário autenticado (3.6). A `veltzy.lead_consents` foi criada pela frente de templates HSM (migration `20260730120000` na branch `feat/whatsapp-templates` do Hub, aplicada à mão no staging em 30/07, fora da develop, por isso o diagnóstico não a achou; descoberta na conferência de 16/11). Eventos adota a tabela sem mudar coluna: `finalidade`, `termo_versao`, `texto_aceito`, `origem` (`formulario`), `canal`, `consentido_em`, `revogado_em`. Grava dois registros por inscrição: `politica_privacidade` (sempre) e `marketing_whatsapp` (só se marcado), a mesma finalidade que o gate de template de marketing consulta. O "SAIR" passa a preencher `revogado_em` dos consentimentos `marketing_whatsapp` ativos do contato, além do `marketing_opt_out` de hoje. É uma linha a mais no `lead-inbound-handler`.

**D8. "SAIR" reaproveitado, sem resposta automática.** O tratamento já existe (3.5). Fica como está, inclusive sem mensagem de confirmação, porque essa foi uma decisão anterior e a especificação manda reaproveitar quando existe. Todo envio do evento checa `leads.marketing_opt_out` antes, inclusive os transacionais (critério 14: "descadastrado não recebe nada").

**D9. Rodapé "Feito com Veltzy" sempre visível (Toni, 18/11/2026).** A proposta era deixar esconder só no `enterprise` ("Elite"); o Toni decidiu que ninguém esconde. Não há toggle na aba 3, e a migration `20261118120000` do Hub remove o trigger `events_guard_powered_by` e prende `show_powered_by` em `true` por CHECK.

**D10. Descrição em Markdown, não HTML.** Não há editor rico nem sanitizador instalados. O editor é um textarea com barra (negrito, itálico, título, lista, link) que insere Markdown. A página pública renderiza com `react-markdown` sem `rehype-raw`, que não executa HTML cru. No save, o servidor ainda remove tags HTML do texto. Links só com `http(s)`, com `rel="noopener noreferrer nofollow"` e `target="_blank"`. Assim não entra dependência nova e o critério 21 fica garantido por construção.

**D11. Open Graph por Vercel Function.** `api/event-og.ts` (Node) atende `/e/:slug` quando o user agent é de robô de preview (WhatsApp, facebookexternalhit, Twitterbot, Slackbot, TelegramBot, LinkedInBot, Discordbot) e devolve o `index.html` do próprio deploy com as metas injetadas. Para os demais user agents, o mesmo HTML com as metas também funciona, então a função atende todos e só muda o cache. O rewrite entra antes do curinga. `/e/:slug/i/:token` não passa pela função e não tem metas de evento.

**D12. Instância do evento.** Coluna nova `events.whatsapp_session_name`, escolhida na aba 4 entre as sessões WAHA da empresa, com padrão na primeira `connected`. Sem sessão escolhida ou com ela fora de `connected` no momento do envio, a mensagem fica `skipped_no_instance`. O contato novo recebe `whatsapp_instance_name` e `whatsapp_provider = 'waha'` só se esses campos estiverem vazios, para as respostas caírem no Inbox pela mesma sessão. Empresa só com Cloud API ou Z-API não envia mensagens de evento na Fase 1 (a especificação fixa WAHA). O dispatcher envia direto pelo provider WAHA (`createProvider('waha')`) com a sessão do evento e grava em `veltzy.messages`, sem passar pelo `whatsapp-send`: aquela função escolhe o provider pelo contato, e um contato antigo de Cloud API iria pela Cloud API.

**D13. Cron com URL e chave no Vault.** `event-scheduler` roda a cada 5 minutos via `pg_cron` + `pg_net`, lendo do Vault `cron_service_role_key` (já existe) e `edge_base_url` (já existe, usado pelos crons do Lemya; mesmo projeto, mesma URL base). Guard: URL ou chave vazia, o job não chama nada. Nunca URL fixa na migration.

**D14. Responsável no rodízio.** "Inativo" = sem papel na empresa em `user_roles` ou `profiles.is_auto_distributable = false`. `is_available` (disponível agora) **não** conta, porque a inscrição costuma chegar dias antes do evento. Sem ninguém válido: `events.created_by`; se ele também saiu da empresa, o negócio nasce `pending_assignment` sem responsável, que é o estado que o Veltzy já usa para fila.

**D15. Cancelamento da inscrição marca o negócio como perdido.** `status = 'lost'`, `closed_at = now()`, e a linha "Cancelou a inscrição em <data>" no bloco de evento das observações (não há coluna de motivo, 3.1). O PDF mostra a opção "Marcar como perdido" nesse mapeamento; na Fase 1 ela é a única opção.

**D16. Chave da feature: `veltzy_events`**, como definido pelo Toni, apesar de as outras chaves terminarem em `_enabled`. Entra na lista de flags do Hub com `product: 'veltzy'`.

**D17. QR code do link de divulgação fica na Fase 1** (seção 7.5 da especificação e PDF). O QR de ingresso, com leitura por câmera no check-in, é da Fase 2. Dependência nova no front: `qrcode` (gera PNG no client). Ver 9.1.

**D18. Rate limit em tabela própria** `veltzy.event_rate_limits`: não há tabela genérica. O IP é guardado só como `sha256(ip || salt)`, com o salt num secret da Edge Function.

## 5. Fluxos

**Criar e publicar.** Eventos > Criar evento abre o editor em rascunho. O cabeçalho mostra o checklist "Pronto para publicar" (título, link, início e fim, local ou link conforme o formato, pipeline e etapa de entrada, Política de Privacidade). Com tudo verde, Publicar libera a página.

**Inscrever.** O visitante abre `app.veltzy.com/e/<slug>` (o link no WhatsApp já mostra título, descrição e banner), preenche e envia. A Edge Function valida, normaliza o WhatsApp e chama a função transacional, que cria ou reaproveita o contato, cria o negócio e enfileira a confirmação. O visitante cai em `/e/<slug>/i/<token>`, com agenda e cancelamento.

**Antes do evento.** O lembrete D-1 sai 24 horas antes do início, com link de um clique que confirma presença e move o negócio para Confirmado.

**No dia.** Modo check-in no celular: busca por nome ou WhatsApp, botão "Presente", desfazer.

**Depois.** Quando o evento termina, quem não fez check-in vira "Não compareceu". No dia seguinte, às 10h no fuso do evento, sai o pós-evento, só para quem marcou o aceite de comunicações. Check-in tardio, até 48 horas depois do fim, corrige o status e o segmento do pós-evento.

## 6. Requisitos

O detalhamento funcional está nas seções 5 a 11 da especificação e vale integralmente, com as mudanças das decisões da seção 4 deste PRD. Os contratos estão nas SPECs.

Requisitos não funcionais:

- Concorrência: a inscrição trava o evento (`SELECT ... FOR UPDATE`) durante toda a transação, então capacidade 1 com duas inscrições simultâneas aceita exatamente uma (critério 7).
- Idempotência: inscrição por `(event_id, whatsapp)` ativa; mensagens por `(registration_id, kind)`; reenvio de confirmação no máximo 1 por hora por inscrição.
- Tokens: 32 bytes aleatórios em base64url, nunca sequenciais, únicos.
- Envio: até 20 mensagens por minuto por sessão WAHA, com intervalo aleatório; até 3 tentativas com backoff.
- Fuso padrão `America/Sao_Paulo`; datas em `timestamptz`.
- Página pública utilizável em 360px, sem rolagem horizontal; barra fixa "Inscrever-se" no mobile.

## 7. LGPD

O tenant é **controlador** dos dados dos inscritos e o Veltzy (Daxen Labs) é **operador**, como no resto do CRM.

| Dado | Finalidade | Base legal | Retenção | Exclusão |
|---|---|---|---|---|
| Nome, sobrenome, WhatsApp, e-mail | gestão da inscrição e comunicação do evento | execução de contrato / procedimentos preliminares (art. 7º, V) | enquanto o contato existir no CRM do tenant; a inscrição é mantida por 24 meses depois do fim do evento | soft delete ao cancelar; hard delete da inscrição a pedido do titular, via tenant, quando não houver outra base para reter |
| Respostas do formulário (incluindo snapshot do rótulo) | qualificação do inscrito pelo organizador | execução de contrato / procedimentos preliminares | 24 meses depois do fim do evento; depois disso `answers` é apagado da inscrição pelo cron de expurgo (as cópias em `deals.observations` seguem a retenção do negócio, sob o controlador) | junto com a inscrição |
| CPF/CNPJ, endereço, data/hora | definida pelo organizador ao ativar o campo | responsabilidade do controlador (tenant); o Veltzy só trata como operador | igual às respostas | igual às respostas |
| Confirmação, lembrete D-1, aviso de cancelamento | comunicação transacional do evento | execução de contrato | log em `event_messages` por 24 meses | junto com a inscrição |
| Pós-evento (presentes e ausentes) | comunicação comercial | **consentimento** (art. 7º, I): checkbox separado da Política e desmarcado, texto "Quero receber comunicações de <organizador> sobre próximos eventos e conteúdos." | registro de consentimento mantido mesmo após a revogação, como prova | revogação por "SAIR" ou pelo tenant preenche `revogado_em`; o registro não é apagado |
| Aceite da Política de Privacidade | prova do aceite | execução de contrato | igual à inscrição | junto com a inscrição |
| `ip_hash`, `user_agent` | prevenção de fraude e rate limit | legítimo interesse (art. 7º, IX) | **90 dias** | expurgo diário via `pg_cron` (zera as duas colunas); o IP cru nunca é gravado |

Controles:

- RLS por tenant em todas as tabelas novas; `anon` sem nenhum grant (testado, critério 19).
- A página pública e a página da inscrição só recebem o que as Edge Functions devolvem: sem ids de tenant, sem tags, sem prioridade, sem pipeline, sem `online_url` antes da inscrição.
- `service_role` e o salt do `ip_hash` só em Supabase Secrets.
- Toda mensagem leva o rodapé fixo "Para não receber mais mensagens, responda SAIR." e nenhuma é enviada a contato com `marketing_opt_out`.
- Registro de consentimento com texto, versão (`eventos-v1`), origem `evento:<id>`, canal e data.
- Pedido de exclusão do titular: o tenant exclui o contato pelo CRM (o `ON DELETE` das FKs cuida da inscrição e dos consentimentos, ver SPEC do Hub). Um botão "excluir inscrição" por linha fica na Fase 2.

Pendência fora do escopo técnico: os textos padrão do aceite e do rodapé devem passar por revisão jurídica antes de produção, como recomenda o `anexo-lgpd.md`.

## 8. Critérios de aceite

Os 26 da seção 13 da especificação, sem alteração de texto, com as leituras abaixo impostas pelas decisões:

- 4: "tags" = tags no contato (D2); "prioridade" = `deals.priority` se D5 for aprovada, senão o critério cai para tags; "origem" = `source_id` Evento + ref/UTMs na inscrição exibidos no negócio (D4).
- 8: o negócio da inscrição cancelada fica `lost` (D15).
- 10: "sem WAHA" = sem sessão escolhida ou sessão fora de `connected` (D12).
- 14 e 15: "descadastrado" = `leads.marketing_opt_out = true` (D8).

O checklist com o resultado de cada um entra na SPEC do Veltzy, na seção de PVO, e na entrega final.

## 9. Pontos validados com o Toni (18/11/2026)

1. **QR code.** Confirmado o recorte da D17: QR do link de divulgação na Fase 1; QR de ingresso e check-in por câmera na Fase 2.
2. **Sobrenome e telefone.** Os quatro fixos (Nome, Sobrenome, E-mail, WhatsApp) nascem obrigatórios. Sobrenome e E-mail podem ficar opcionais por decisão do organizador; Nome e WhatsApp são travados. O WhatsApp do inscrito **não aceita fixo**: só celular (11 dígitos, começa em 9). A regra vale só no fluxo de evento; o `isValidPhoneBR` do Inbox continua aceitando fixo.
3. **Métricas.** Sem ICP por enquanto, porque exigiria qualificar o lead. O painel não tem card de ICP nem de "Inscritos qualificados". A lista mostra inscritos/vagas, confirmados e presentes (presentes só depois do início).
4. **Prioridade (D5)** mantida. **Rodapé (D9)**: ninguém esconde, ver D9.
5. Referências externas: o `anexo-lgpd.md` foi encontrado e usado; o template da trilha G não existe (3.16).

## 10. Fora da Fase 1

E-mail; lista de espera; "coletar de cada participante ou um por compra"; botão de exclusão de inscrição por linha; telefone fora do Brasil; tela de gestão de URL de privacidade padrão do tenant.

## 11. Fase 2 (somente desenho)

Nada daqui é implementado agora. O modelo da Fase 1 já reserva `price_cents`, `currency`, `is_paid`, `payment_status` e `amount_cents` para não precisar migrar dados depois.

**Asaas por tenant.** A chave de API do tenant fica no Vault (mesmo padrão de `ai_secret_upsert`/`ai_secret_read` e do A7 do token Cloud API), nunca em tabela legível pelo client. Aba Integrações do Veltzy: colar chave, "Testar conexão" (Edge Function chama `GET /myAccount` do Asaas) e ambiente sandbox ou produção.

**Ingressos e lotes.** `veltzy.event_ticket_types`: `event_id`, nome, `price_cents`, `quantity`, `sales_starts_at`/`sales_ends_at`, `lot_order`, `auto_advance` (vira o lote ao esgotar), `is_free`. A capacidade do evento passa a ser a soma dos lotes ou um teto próprio, o que for menor.

**Pedidos e pagamento.** `veltzy.event_orders`: `event_id`, comprador, `asaas_customer_id`, `asaas_payment_id`, `billing_type` (Pix, cartão, boleto), `total_cents`, `status`, `expires_at`. `event_registrations.order_id` liga a inscrição ao pedido. O customer do Asaas exige CPF/CNPJ, então o campo vira obrigatório em evento pago. "Coletar dados de cada participante ou um por compra" define se o pedido gera uma ou várias inscrições.

**Reserva com expiração.** Enquanto `payment_status = 'pending'` a vaga fica reservada: Pix 30 minutos, cartão imediato, boleto até o vencimento. O `event-scheduler` expira reservas vencidas e libera a vaga (reabrindo o evento fechado por capacidade, igual ao cancelamento).

**Webhook do Asaas.** Edge Function pública com validação do token de acesso do webhook. `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` confirmam a inscrição e movem o negócio; `PAYMENT_OVERDUE`, `PAYMENT_DELETED` e `PAYMENT_REFUNDED` cancelam ou estornam. Idempotência pelo id do evento do Asaas, numa tabela de eventos recebidos. O valor do ingresso vira `deals.value`.

**Ingresso com QR.** Token assinado (HMAC com segredo por ambiente) com `registration_id` e validade; o modo check-in ganha leitura pela câmera, que chama o mesmo `check_in`. O `Permissions-Policy` do `vercel.json` hoje bloqueia a câmera (`camera=()`) e precisa liberar `self`.

**LP básica.** Blocos fixos (hero, sobre, palestrantes, agenda, FAQ, local) em `events.page_blocks jsonb`, com o visual da aba Aparência. Sem construtor livre.

**Pixels.** Meta Pixel e GA4 por evento na página pública, com evento de conversão na inscrição. Exige banner de cookies e a atualização da CSP.

**Convites pela base do CRM.** Segmento de contatos, disparo com link do evento e `?ref=convite-crm`, reaproveitando o throttle do `blast-dispatch` e respeitando `marketing_opt_out` e consentimento.

**SDR IA (enterprise).** O `sdr-ai` atua no inscrito antes do evento (confirmar presença, tirar dúvidas, qualificar), usando a sessão do evento.

**ROI do evento.** Painel com inscritos, presentes, negócios ganhos e receita, lendo `deals.status = 'won'` e `deals.value` dos negócios nascidos do evento.

**Decisão em aberto (Toni):** cobrar taxa da plataforma via split do Asaas.
