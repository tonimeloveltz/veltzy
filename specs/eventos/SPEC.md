# SPEC (Veltzy): Eventos, Fase 1, blocos (b) a (f)

> PRD: `specs/eventos/PRD.md` (decisões D1 a D18, estado atual na seção 3)
> SPEC irmã: `hub/specs/eventos/SPEC.md`, bloco (a): migration, RLS, funções, storage, cron
> Referência visual: `referencia-eventos.pdf` / canvas `claude.ai/artifact/VDSAopUq6u2bUysQweLssR` (dados fictícios)
> Status: rascunho do copiloto, aguardando revisão da Leticia

<!-- arquivos -->
- `supabase/config.toml`
- `supabase/functions/_shared/phone.ts`, `_shared/lead-inbound-handler.ts`
- `supabase/functions/_shared/events/*` (novos: `render.ts`, `form-validate.ts`, `ip-hash.ts`, `dispatch.ts`, `public-urls.ts` + testes)
- `supabase/functions/event-public/`, `event-register/`, `event-registration/`, `event-admin-register/`, `event-scheduler/`, `event-dispatcher/` (novos)
- `api/event-og.ts` (novo), `vercel.json`
- `package.json` (`qrcode`, `@types/qrcode`)
- `src/App.tsx`, `src/components/layout/app-sidebar.tsx`
- `src/types/events.ts` (novo), `src/types/database.ts` (`Deal.priority`)
- `src/lib/events/*` (novos), `src/services/events*.service.ts` (novos), `src/hooks/events/*` (novos)
- `src/components/events/**` (novos), `src/pages/eventos*.tsx`, `src/pages/evento-*.tsx` (novos)
- `src/components/pipeline/edit-lead-modal.tsx` (bloco "Evento"), `src/components/pipeline/deal-card.tsx` (selo de prioridade)
<!-- /arquivos -->

## Pré-requisito

Bloco (a) do Hub aplicado no staging, conferido e liberado pelo copiloto. Nenhum arquivo deste documento que leia ou escreva tabela nova começa antes disso.

Branch: `feat/eventos` a partir da `develop` (com `--no-track`). `npm run preflight` antes de cada bloco; falhou, para.

Ao fim de cada bloco: "Rodo o PVO ou seguimos codificando?"

## Respostas do Toni (PRD 9), 18/11/2026

| Pendência | Resposta | O que muda |
|---|---|---|
| 1. Prioridade (D5) | "A": mantém a proposta | `deals.priority` fica; selo no `deal-card.tsx` e na tabela de inscritos, select no drawer da opção e regras de qualificação da aba 4 seguem como escritos |
| 2. Elite = enterprise (D9) | Ninguém esconde o rodapé | Sem toggle "Mostrar Feito com Veltzy" na aba 3. Migration nova no Hub `20261118120000_veltzy_eventos_powered_by_sempre.sql`: remove o trigger `events_guard_powered_by` e prende a coluna em `true` por CHECK |
| 3. Sobrenome e telefone | Os quatro fixos nascem obrigatórios; Sobrenome e E-mail o organizador pode soltar; WhatsApp não aceita fixo | Rascunho novo com Sobrenome obrigatório. `event-register` e `event-admin-register` usam `_shared/events/mobile-phone.ts` (`isMobilePhoneBR`, com teste): fixo válido devolve `not_mobile`, inválido `invalid_phone`. O `isValidPhoneBR` compartilhado com o Inbox não muda. O formulário público (bloco e) repete a regra com a mensagem "Use um celular com WhatsApp" |
| 4. Métricas | Sem ICP por enquanto, porque exigiria qualificar o lead | Sai o card "Inscritos qualificados" da aba 7; a lista `/eventos` fica como está (inscritos/vagas, confirmados, presentes) |
| 5. QR code (D17) | Confirmado | QR do link de divulgação na aba 5 e dependência `qrcode`, como escrito |


## Convenções que valem para tudo

- Nada de `service_role` em `src/`, nem em comentário (a preflight barra).
- Cores só por token; as cores do evento (dado do tenant) entram por `style` na página pública e no preview, como `lead_sources.color` e `lead_tags.color` já fazem.
- Componente acima de ~200 linhas é decomposto. Página só compõe.
- Sem em dash em texto de interface.
- Datas sempre formatadas no `timezone` do evento (`Intl.DateTimeFormat('pt-BR', { timeZone })`), nunca no fuso do navegador.

---

## Bloco (b): tipos, Edge Functions, config e secrets

### Tipos

`src/types/events.ts` com as interfaces `Event`, `EventFormField`, `EventFieldOption` (`id`, `label`, `tag: string | null`, `priority: 'low' | 'medium' | 'high' | null`), `EventRegistration`, `EventRefCode`, `EventAssignee`, `EventMessage`, `EventAppearance`, `EventMessagesConfig`, `EventPublic`, `RegistrationPublic`, e os unions `EventStatus`, `EventPublicStatus` (`open | not_open | sold_out | closed | finished | canceled`), `EventFormat`, `RegistrationStatus`, `EventMessageKind`, `EventMessageStatus`, `FieldType`, `FieldKind`. Espelham a migration do Hub coluna a coluna. Em `database.ts`, `Deal.priority?: 'low' | 'medium' | 'high' | null`.

### Shared (Deno), lógica pura com testes

| Arquivo | Conteúdo |
|---|---|
| `_shared/phone.ts` | acrescentar `isValidPhoneBR` e `DDDS_VALIDOS`, cópia exata de `src/lib/phone.ts`, para o servidor validar com a mesma regra do front |
| `_shared/events/form-validate.ts` | valida `answers` contra os campos do evento: obrigatório, tipo, opção existente, `checkbox` com vários, `text` até 255, `paragraph` até 2000, e-mail, CPF/CNPJ com dígito verificador, `terms` = true, `city_state`/`address` como objeto. Devolve `Record<fieldId, código>` |
| `_shared/events/render.ts` | `renderEventMessage(template, vars)`: troca `{{var}}`, remove a linha inteira em que `{{link_online}}` ficar vazio, `{{local}}` = "Online" no formato online, acrescenta sempre `\n\nPara não receber mais mensagens, responda SAIR.`. `formatEventDate` ("sáb, 28 de nov") e `formatEventTime` ("09:00") no fuso do evento |
| `_shared/events/ip-hash.ts` | `hashIp(ip, salt)` = sha256 hex; IP do primeiro item de `x-forwarded-for`, senão `cf-connecting-ip`, senão `'unknown'` |
| `_shared/events/public-urls.ts` | `registrationUrl(slug, token)`, `confirmUrl` (`?confirmar=1`), `assetUrl(path)` (URL pública do bucket `event-assets`) |
| `_shared/events/dispatch.ts` | o laço do dispatcher, usado por `event-dispatcher` e `event-scheduler` |

Testes (`*.test.ts`, rodados com `npx --yes deno test`): renderização com e sem link online, rodapé sempre presente, datas em fuso diferente do servidor, CPF/CNPJ válidos e inválidos, opção inexistente, checkbox em radio.

### Edge Functions

Todas usam `getCorsHeaders` (origens já restritas a `app.veltzy.com`, `develop.*`, previews do Vercel e `localhost:5173`) e tratam `OPTIONS`. As públicas nunca devolvem id de empresa, pipeline, etapa, tag, prioridade ou `online_url` antes da inscrição.

**`event-public`** (GET `?slug=`, `verify_jwt = false`)
- `rpc('get_event_public', { p_slug })`. Nulo → `404 { error: 'not_found' }`, corpo igual para rascunho, inexistente e excluído.
- Troca `appearance.logo_path`/`banner_path` por `logo_url`/`banner_url` absolutas.
- `Cache-Control: public, max-age=30`.

**`event-register`** (POST, `verify_jwt = false`)
- Corpo: `{ slug, first_name, last_name?, email?, whatsapp, answers: [{field_id, value}], ref?, utm_source?, utm_medium?, utm_campaign?, utm_content?, utm_term?, referrer?, consent_privacy, consent_marketing, website (honeypot), rendered_at (epoch ms), idempotency_key (uuid) }`.
- Ordem: zod no envelope → honeypot preenchido = `400 { result: 'rejected' }` → `Date.now() - rendered_at < 3000` = `400 { result: 'rejected' }` → carrega o evento pelo slug (service role, só `id`, `status` e campos) → `rpc('event_rate_limit_hit')` falso = `429 { result: 'rate_limited' }` → `normalizePhoneBR` + `isValidPhoneBR` → e-mail obrigatório se o campo fixo `email` estiver `required` → `form-validate` → `rpc('register_for_event', { p_payload })` com `ip_hash`, `user_agent`, textos de aceite e `idempotency_key`.
- Respostas: `ok` → `{ result: 'ok', token }` e dispara `event-dispatcher` com `{ message_id }` da confirmação em segundo plano (`EdgeRuntime.waitUntil`), para a confirmação não esperar o cron; `duplicate` → `rpc('enqueue_duplicate_resend')` e `{ result: 'duplicate' }` **sem token**; `sold_out | closed | not_open | finished | canceled` → `{ result }`; `validation` → `422 { result, errors }`.
- `ref` normalizado (minúsculas, `a-z0-9-`, 40). Se não existir em `event_ref_codes` do evento, grava assim mesmo: o painel mostra como origem não cadastrada.

**`event-registration`** (`verify_jwt = false`)
- GET `?token=` → `rpc('get_registration_public')`; nulo → 404 neutro.
- POST `{ token, action: 'confirm' | 'cancel' }` → `confirm_registration` / `cancel_registration`. Resultado repassado.

**`event-admin-register`** (`verify_jwt = true`)
- Valida o JWT, pega o profile, exige papel admin, manager ou super_admin e `profile.company_id` = empresa do evento. Mesmo corpo do público, sem honeypot e sem tempo mínimo, com `source: 'manual'` e `actor_profile_id`. Marketing sempre falso.

**`event-scheduler`** (`verify_jwt = false`, protegida por `isCronAuthorized`)
- `rpc('events_scheduler_tick')` e depois o laço do dispatcher com orçamento de 120 s.

**`event-dispatcher`** (`verify_jwt = false`, `isCronAuthorized`)
- Corpo opcional `{ message_id }`. `rpc('claim_event_messages', { p_limit: 50, p_message_id })`.
- Para cada mensagem, nesta ordem:
  1. inscrição cancelada, ou evento cancelado e a mensagem não é `cancel_notice` → `canceled`;
  2. `leads.marketing_opt_out` → `skipped_opt_out`;
  3. `post_*`: tipo recalculado pelo status atual da inscrição (`attended` → `post_present`, `absent` → `post_absent`, outro → `canceled`); sem `consent_marketing` ou com `lead_consents.revogado_em` preenchido no registro `marketing_consent_id` → `skipped_no_consent`;
  4. `events.whatsapp_session_name` vazio, ou `public.waha_instances.status <> 'connected'` para essa sessão e empresa → `skipped_no_instance`;
  5. 20 ou mais `sent` dessa sessão nos últimos 60 s → `complete_event_message(..., 'deferred')`;
  6. renderiza (`duplicate_resend` usa o texto da confirmação), envia com `createProvider('waha').sendMessage({}, { phone: lead.phone, message, type: 'text', sessionName, companyId })`, grava em `veltzy.messages` (`sender_type 'ai'`, `source 'whatsapp'`, `message_type 'text'`, `instance_name`, `delivery_status`) para aparecer no Inbox, e fecha com `sent` (texto renderizado, `provider_message_id`) ou `failed` (o SQL refaz até 3 vezes, com backoff de 1, 5 e 25 min).
- Entre envios da mesma sessão, espera aleatória de 2 a 5 s.
- O envio **não** passa pelo `whatsapp-send`: ele escolhe o provider pelo contato (`leads.whatsapp_provider`), e um contato antigo de Cloud API iria pela Cloud API em vez da sessão do evento (PRD D12).

### Mudança no inbound (D7)

Em `_shared/lead-inbound-handler.ts`, logo depois de marcar `marketing_opt_out` (linhas 302 a 307), revogar os consentimentos de marketing ativos do contato: `update lead_consents set revogado_em = now() where company_id = ? and lead_id = ? and finalidade = 'marketing_whatsapp' and revogado_em is null`. Sem resposta automática (D8). Teste no `lead-inbound-handler.test.ts`.

### `supabase/config.toml`

```toml
[functions.event-public]
verify_jwt = false

[functions.event-register]
verify_jwt = false

[functions.event-registration]
verify_jwt = false

[functions.event-scheduler]
verify_jwt = false

[functions.event-dispatcher]
verify_jwt = false
```

`event-admin-register` fica com o padrão (`verify_jwt = true`).

### Secrets (staging; produção só com OK do Toni)

- `EVENT_IP_SALT`: 32 bytes aleatórios, gerados pela Leticia.
- `PUBLIC_APP_URL`: URL do front do ambiente, sem barra no fim. Staging: `https://develop.veltzy.com` (igual ao secret `APP_URL` já existente; `develop.app.veltzy.com` não resolve). Gravado em 16/11/2026, junto com o `EVENT_IP_SALT`.
- Já existem e são reaproveitados: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, o segredo do Hub usado por `waha-hub.ts`.

O cron lê `edge_base_url` do Vault, que já existe (passo 2 da SPEC do Hub); até o deploy do `event-scheduler` ele bate num 404 sem efeito. Deploy: CI do PR #271 se já estiver ativo no staging; senão manual, `npx --yes supabase@2.122.0 functions deploy <nome> --project-ref hfebvugdsztnzgpybdwj`.

---

## Bloco (c): área admin, lista e abas 1 a 4

### Gate, menu e rotas

- Sidebar: item "Eventos" (`CalendarDays`) entre Contatos e Relatórios, visível para todos os papéis quando `company.features.veltzy_events === true`.
- Rotas dentro do layout protegido: `/eventos`, `/eventos/:id`, `/eventos/:id/check-in`.
- Sem a feature, as três rotas renderizam `EventsUpgradeScreen` (ícone, "Eventos não está no seu plano", texto curto e botão de contato com o suporte). **Não** usar `requireFeature` do `ProtectedRoute`, que redireciona.
- O vendedor abre o editor em modo leitura: campos desabilitados e sem Salvar, Publicar, Duplicar e Cancelar. A RLS já barra a escrita; a UI só não oferece.

### Camada de dados

- `src/services/events.service.ts`: listar por aba, obter, criar (rascunho com `created_by`, `event_tag_name = "Evento: <título>"` e os campos fixos), atualizar, soft delete, e as RPCs `publish_event`, `unpublish_event`, `cancel_event`, `duplicate_event`, `create_event_pipeline`, `event_slug_available`, `event_publish_missing`. Sempre filtra por `company_id`.
- `src/services/event-form-fields.service.ts`: CRUD e reordenação em lote (`position`).
- `src/services/event-registrations.service.ts`: listar com busca e filtro, contadores, `check_in`, `undo_check_in`, `admin_set_registration_status`, `admin_resend_confirmation`, inscrição manual (`functions.invoke('event-admin-register')`).
- `src/services/event-assets.service.ts`: upload em `event-assets/<company_id>/<event_id>/logo|banner-<uuid>.<ext>`, recusando acima de 2 MB (logo) e 5 MB (banner) antes de enviar.
- Hooks em `src/hooks/events/`, um por arquivo, React Query com chaves `['events', companyId, tab]`, `['event', id]`, `['event-fields', id]`, `['event-registrations', id, filtros]`, `['event-stats', id]`.

### Lista `/eventos`

Abas Próximos (publicado/fechado com fim no futuro), Rascunhos, Encerrados (finalizado, cancelado ou fim no passado), com contador. Linha: bloco de data, título, "sáb · 09:00 às 17:00 · Presencial · São Paulo, SP", selo de status (Publicado, Esgotado, Inscrições encerradas, Rascunho, Finalizado, Cancelado), inscritos/vagas com barra (ou "/ sem limite"), confirmados e presentes (este só depois do início, ver PRD 9.3), ações Ver página, Copiar link e menu (Editar, Duplicar, Modo check-in, Cancelar evento com diálogo de confirmação). Estado vazio com CTA. "Criar evento" cria o rascunho e abre o editor.

### Editor `/eventos/:id`

- Cabeçalho: breadcrumb, título, selo de status, indicador "Alterações não salvas", Ver página, Copiar link, Salvar, Publicar/Despublicar.
- Formulário único (`react-hook-form` + `zod`) cobrindo as abas 1 a 4; Salvar grava tudo, e o formulário de inscrição em lote.
- Lateral "Pronto para publicar": a mesma lista de `event_publish_missing`, recalculada no client a cada mudança (`src/lib/events/publish-checklist.ts`, com teste) e validada de novo pela RPC no Publicar. Pendência leva o usuário ao campo.
- **Proteção contra saída.** O app usa `BrowserRouter`, então `useBlocker` não está disponível. Usar `beforeunload` com alterações pendentes e um diálogo de confirmação nos links do próprio editor (breadcrumb, "Ver inscritos" e modo check-in). Saída pelo menu lateral com alterações pendentes não é bloqueada na Fase 1: registrar em "Decisões tomadas".

**Aba 1, Visão geral.** Como a seção 7.2 da especificação e o PDF (pág. 2), com:
- slug gerado do título (sem acento, minúsculas, hífens, `src/lib/events/slug.ts` com teste), editável, checado com debounce de 400 ms por `event_slug_available` ("Disponível" / "Em uso"); evento publicado avisa que o link antigo para de funcionar;
- descrição: textarea com barra Negrito, Itálico, Título, Lista e Link que insere Markdown (D10); preview com o mesmo renderer da página pública;
- CEP com ViaCEP (`src/hooks/events/use-viacep.ts`, `https://viacep.com.br/ws/<cep>/json/`, só preenche campos vazios, erro silencioso);
- datas em `America/Sao_Paulo`; "Inscrições fecham" com padrão no início; vagas com toggle ilimitado e "mostrar vagas restantes";
- URL da Política de Privacidade obrigatória para publicar, sem pré-preenchimento (PRD 3.14).

**Aba 2, Formulário de inscrição.** Três colunas como no PDF (pág. 4): chips à esquerda, preview no meio, drawer de edição à direita.
- Fixos: Nome (obrigatório, travado), Sobrenome (obrigatório por padrão, pode ficar opcional, Toni 18/11), E-mail (obrigatório por padrão, pode ficar opcional), WhatsApp (obrigatório, travado). Não reordenam nem saem.
- Pré-definidos entram uma vez (chip desabilitado depois); personalizáveis, várias vezes. Contador "N de 30 campos".
- Reordenação com `@dnd-kit/sortable`.
- Drawer: rótulo, ajuda, placeholder, obrigatório; opções (mínimo 2, máximo 30, reordenáveis) com tag (escolher de `lead_tags` ou digitar nova) e prioridade (Sem prioridade, Baixa, Média, Alta); destino: "Só resposta" ou "Campo do contato" (Empresa → `company_name`, Instagram → `instagram_handle`, LinkedIn → `linkedin_url`). **"Campo do negócio" não aparece na Fase 1**: o negócio não tem campo personalizado compatível, e todas as respostas já vão para as observações do negócio (D6). Empresa nasce com destino `company_name`; Cargo, "só resposta".
- Termo de Responsabilidade: texto do termo + "Li e aceito", sempre obrigatório.
- Campo com respostas: editar ou excluir mostra "N inscrições já responderam este campo. As respostas antigas ficam preservadas com o rótulo da época." A exclusão é DELETE normal: o trigger do Hub converte em soft delete.
- Rodapé fixo do preview: aceite da Política (obrigatório, com link) e marketing (desmarcado), textos da seção 12 da especificação.

**Aba 3, Aparência.** Upload de logo e banner com preview (o enquadramento é `object-fit: cover` com posição fixa no centro; ajuste manual fica fora da Fase 1), cor primária, de fundo e do texto do botão (input `color` + hex), tema claro/escuro. Aviso de contraste por `src/lib/events/contrast.ts` (razão WCAG 2.1, com teste): botão (texto do botão sobre a primária) e título (texto do tema sobre o fundo) abaixo de 4,5:1 mostram aviso amarelo, sem bloquear. O rodapé "Feito com Veltzy" aparece sempre: não há toggle (Toni, 18/11). Preview ao vivo com Desktop/Mobile, usando os mesmos componentes da página pública.

**Aba 4, Pipeline e automações.** Como o PDF (pág. 6):
- pipeline e mapeamento Nova inscrição / Confirmou presença / Fez check-in / Sem check-in até o fim (selects das etapas do pipeline escolhido); "Cancelou a inscrição → Marcar como perdido" fixo (D15); contadores por etapa;
- "Criar pipeline para este evento" → `create_event_pipeline`, recarrega pipelines e mapeamento;
- aviso: "Mudar a pipeline não move negócios já criados";
- tag aplicada em todo inscrito (`event_tag_name`, editável);
- responsável: Fixo (select de membros) ou Rodízio (lista arrastável, indicador "Próximo" = `rr_cursor`, contagem de negócios por pessoa no evento);
- regras de qualificação: só leitura, listando opção → tag/prioridade, com link para o campo;
- sessão WAHA (D12): select das `waha_instances` da empresa com status; padrão na primeira `connected`; "WAHA conectada · (11) 9...." ou "Desconectada · Configurar" (link para a tela de WhatsApp);
- mensagens: 5 cards com toggle e editor; chips de variável inserem `{{var}}` no cursor; prévia renderizada com dados de exemplo por `src/lib/events/render-message.ts`, cópia exata do `_shared/events/render.ts` (com teste espelhado); rodapé SAIR mostrado e não editável; nota "Envio em ritmo seguro, até 20 mensagens por minuto...".

---

## Bloco (d): abas 5 a 7 e modo check-in

**Aba 5, Divulgação** (PDF pág. 7). Link principal com Copiar e Abrir; QR do link (`qrcode`, `toDataURL`, botão "Baixar QR code (PNG)", D17); texto pronto para WhatsApp (título, data por extenso, local, "Vagas limitadas." quando há capacidade, "Inscrição gratuita:" e link) com Copiar; códigos de divulgador (criar com nome + código, link `?ref=`, inscritos e presentes por código, e "Link direto (sem código)"); montador de UTM (source, medium, campaign) com o link gerado e Copiar.

**Aba 6, Inscritos** (PDF pág. 8).
- Cabeçalho: inscritos, confirmados, presentes; "+ Adicionar inscrito" (admin/gestor), "Exportar CSV", "Modo check-in".
- Busca (nome, WhatsApp, e-mail; dígitos da busca comparados com `whatsapp`), filtros de status e origem (ref, UTM source, direto). Paginação de 50, com `range` e `count: 'exact'` (o `max_rows` corta em 1000 sem erro).
- Colunas: inscrito (nome, e-mail, selo de prioridade se houver), WhatsApp (`formatPhoneBR`), empresa (resposta do pré-definido Empresa), origem (`ref_code` → `utm_source` → "direto"), status, check-in (botão "Marcar presente" ou "Presente · 08:52" + "Desfazer"), ações: abrir negócio, abrir conversa (`/inbox/<lead_id>`), menu (Confirmar manualmente, Cancelar inscrição, Reenviar confirmação). Os três itens do menu só aparecem para admin/gestor.
- **Abrir negócio:** abre o `EditLeadModal` existente sobre a tabela, no negócio da inscrição. Se o modal não aceitar abrir por `deal_id`, a codificadora reporta antes de adaptar.
- "Reenviar confirmação" com `rate_limited` mostra "Já reenviado na última hora".
- Adicionar inscrito: diálogo com o mesmo formulário do evento (`RegistrationFormFields`, compartilhado com a página pública), sem os aceites.
- CSV (`src/lib/events/csv-export.ts`, com teste): `papaparse.unparse`, separador `;`, prefixo `﻿`, colunas fixas (nome, sobrenome, e-mail, WhatsApp formatado, status, check-in, inscrito em, origem, ref, utm_source, utm_medium, utm_campaign, utm_content, utm_term, marketing) e uma coluna por campo do formulário pelo `label_snapshot`, valor `display`. Busca todas as linhas em páginas de 1000.

**Aba 7, Painel** (PDF pág. 9, com PRD 9.3). Cards: inscritos (de N vagas), vagas restantes, confirmados (% dos inscritos), presentes, taxa de presença (presentes / (presentes + ausentes), "Sem dados" antes do evento) (sem card de ICP nem de qualificados, Toni 18/11). Gráfico de barras por dia (Recharts, últimos 14 dias ou desde a criação, dias no fuso do evento). Inscrições e presenças por origem. Funil Inscrito → Confirmado → Presente. Contas em `src/lib/events/event-stats.ts` (puro, com teste), sobre as inscrições não canceladas.

**Modo check-in** `/eventos/:id/check-in` (PDF pág. 14). Tela cheia, sem sidebar, mobile-first: cabeçalho escuro com voltar, "23 de 86 presentes" e barra; busca grande com foco automático; cards com nome, empresa e telefone; botão "Presente" de 48 px de altura ou "✓ 08:52"; tocar no verde pergunta "Desfazer check-in?". Atualização otimista com rollback em erro. Realtime não é exigido: refetch a cada 15 s. "+ Adicionar" só para admin/gestor. Fora da janela (mais de 48 h depois do fim), mensagem e botões desabilitados.

---

## Bloco (e): página pública, página da inscrição e Open Graph

### Rotas

`/e/:slug` e `/e/:slug/i/:token` no grupo público do `App.tsx`, ao lado de `/privacidade`, sem `ProtectedRoute` e sem o layout do app. Não carregam a store de auth da empresa nem nada que dependa de sessão.

### `/e/:slug` (PDF págs. 10 a 12)

- Dados só pela `event-public` (`supabase.functions.invoke` com GET, ou `fetch` com a anon key); nada de select direto.
- Layout: topo com logo e nome do organizador; banner (fallback: bloco na cor primária); data ("sábado, 28 de novembro · 09:00 às 17:00"); título; local + cidade + formato; "Sobre o evento" em Markdown (`react-markdown` + `remark-gfm`, sem `rehype-raw`; links com `target="_blank" rel="noopener noreferrer nofollow"`; só `http(s)` e `mailto`); card do local com "Abrir no Google Maps" (link de busca, sem embed) ou "Online, link enviado após a inscrição"; organizador; formulário num card lateral no desktop.
- Mobile: barra fixa inferior "Gratuito · Inscrições até 28/11 · Inscrever-se", que rola até o formulário.
- Estados: aberto; "Inscrições abrem em <data>"; "Vagas esgotadas"; "Inscrições encerradas"; "Evento finalizado"; "Evento cancelado"; 404 neutro (`EventNotFound`, sem marca de nenhum tenant).
- Tema e cores do evento por variáveis CSS locais ao container (`--ev-primary`, `--ev-bg`, `--ev-btn-text`), sem mexer nos tokens globais do app.
- Rodapé "Feito com Veltzy" (link para o site) sempre.
- Formulário: `RegistrationFormFields` (compartilhado com o diálogo manual), máscaras (`formatPhoneBR`; CPF/CNPJ por `src/lib/events/document-br.ts`, com teste), ViaCEP no Endereço, UF em select, Data/Hora com `input type="datetime-local"`. Campo honeypot `website` fora da tela (`position:absolute; left:-10000px`, `tabIndex=-1`, `autoComplete="off"`, `aria-hidden`). `rendered_at` gravado ao montar o formulário; `idempotency_key` (`crypto.randomUUID()`) gerada ao montar e mantida entre tentativas. Botão desabilitado durante o envio.
- Captura `ref` e `utm_*` da URL na montagem (e `document.referrer`) e envia junto.
- Resultados: `ok` → navega para `/e/<slug>/i/<token>`; `duplicate` → "Este WhatsApp já está inscrito neste evento." (sem prometer reenvio: a confirmação pode estar desligada ou a sessão desconectada; quando ligada, o reenvio sai igual); `sold_out`/`closed`/`not_open`/`finished`/`canceled` → recarrega e mostra o estado; `rate_limited` → "Muitas tentativas, tente em alguns minutos"; `validation` → erro por campo; `rejected` → mensagem genérica de erro.

### `/e/:slug/i/:token` (PDF pág. 13)

- `event-registration` GET. Token inválido → 404 neutro.
- "Inscrição confirmada" (ou "Presença confirmada" com status `confirmed`), "<Nome>, guarde este link: aqui ficam os detalhes da sua inscrição." (texto neutro: a página não sabe se a confirmação saiu), resumo, link da transmissão quando houver, mensagem do organizador.
- "Adicionar ao Google Agenda" (`src/lib/events/google-calendar.ts`, URL `calendar.google.com/calendar/render?action=TEMPLATE...` em UTC) e "Baixar arquivo de agenda (.ics)" (`src/lib/events/ics.ts`, gerado no client, `UID` = token, `DTSTART`/`DTEND` em UTC, texto escapado). Os dois com teste.
- "Confirmar presença" quando `can_confirm` e faltam menos de 48 h. Com `?confirmar=1` e `can_confirm`, confirma sozinho ao abrir e mostra o sucesso.
- "Cancelar minha inscrição" quando `can_cancel`, com diálogo.

### Open Graph (D11)

`api/event-og.ts`, Vercel Function com `export const config = { runtime: 'edge' }`:
1. Lê `slug` da query; se não bater `^[a-z0-9-]{3,80}$`, devolve o `index.html` sem mudança.
2. `fetch(new URL('/index.html', req.url))` para pegar o HTML do próprio deploy.
3. `fetch(<VITE_SUPABASE_URL>/functions/v1/event-public?slug=...)` com `apikey`/`Authorization` = anon key (variáveis já existentes no projeto Vercel).
4. Com evento: troca o `<title>` e injeta antes de `</head>` `og:title`, `og:description` (descrição sem Markdown, até 160 caracteres), `og:image` (banner absoluto; sem banner, o logo; sem os dois, nenhuma), `og:url`, `og:type=website`, `twitter:card=summary_large_image`, tudo com escape de HTML. Sem evento: o HTML com a meta genérica de sempre.
5. `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.

`vercel.json`: rewrite `{ "source": "/e/:slug", "destination": "/api/event-og?slug=:slug" }` **antes** do curinga. `/e/:slug/i/:token` continua no curinga (página privada, sem metas do evento). A URL do navegador não muda, então o React Router renderiza a página normalmente.

Conferir se `api/` precisa entrar no `tsconfig` ou no lint; não deixar o `tsc -b` quebrar por causa dele.

---

## Bloco (f): automações

- Confirmação: enfileirada pela função de inscrição, disparada na hora pelo `event-register` e, se falhar, pelo cron.
- Lembrete D-1, encerramento, pós-evento e janela de inscrição: `events_scheduler_tick` via cron a cada 5 min.
- Aviso de cancelamento: `cancel_event` enfileira quando o toggle está ligado.
- Reenvio por duplicidade e pelo botão: `duplicate_resend`, limitado a 1 por hora.
- SAIR: mudança do bloco (b) no inbound.
- Nenhuma mensagem para contato com `marketing_opt_out`; pós-evento só com consentimento ativo.

Teste ponta a ponta no staging com a sessão WAHA de teste (cuidado: a sessão `stark-tech-solucoes` roteia todo inbound para o "Pipeline de Testes", ver memória do projeto). Usar só números da equipe.

---

## Critérios de aceite

Os 26 da seção 13 da especificação, com as leituras do PRD seção 8. O PVO de cada critério entra na tabela abaixo, com a evidência.

| # | Critério | Como verificar | Resultado |
|---|---|---|---|
| 1 | sem feature: sem menu, rota com upgrade | desligar a flag no Hub, abrir `/eventos` | |
| 2 | criar, um campo de cada tipo, publicar, abrir pelo link | browser | |
| 3 | publicar sem pipeline, datas ou privacidade lista o que falta | browser | |
| 4 | inscrição cria/reaproveita contato sem sobrescrever; negócio com etapa, tags, prioridade, responsável, origem e respostas | browser + negócio no pipeline | |
| 5 | mesma pessoa em dois eventos: dois negócios, um contato | SQL de conferência | |
| 6 | mesmo WhatsApp no mesmo evento: sem negócio, sem vaga, sem token | resposta da function + SQL | |
| 7 | capacity 1, duas simultâneas: uma `ok`, uma `sold_out`, evento `closed` | dois `curl` em paralelo | |
| 8 | cancelar libera e reabre | browser + SQL | |
| 9 | rodízio em sequência | 3 inscrições, 3 responsáveis em ordem | |
| 10 | confirmação pelo WAHA; sem WAHA, `skipped_no_instance` | celular da equipe + `event_messages` | |
| 11 | D-1 uma vez; mudar data reprograma | evento de teste com início em 23 h + troca de data | |
| 12 | link do lembrete confirma e move para Confirmado | celular | |
| 13 | check-in/desfazer; encerramento marca ausentes; check-in tardio corrige | browser + pipeline | |
| 14 | pós-evento só com consentimento; descadastrado não recebe nada | `event_messages.status` | |
| 15 | SAIR descadastra (e revoga o consentimento) | celular + SQL | |
| 16 | ref e UTMs no negócio e no painel | browser | |
| 17 | link no WhatsApp mostra título, descrição e banner | `curl -A "WhatsApp/2.23.20.0" <url>` + colar no WhatsApp | |
| 18 | página pública sem `online_url` antes da inscrição | resposta da `event-public` | |
| 19 | anon não lê tabela nova pela REST | `curl` com a anon key em cada tabela | |
| 20 | tenant B não acessa nada do tenant A | login em outra empresa + REST com o JWT dela | |
| 21 | HTML/script na descrição não executa | descrição com `<script>` e `<img onerror>` | |
| 22 | honeypot, menos de 3 s e rate limit rejeitam | `curl` | |
| 23 | CSV abre com acentos no Excel | arquivo aberto no Excel (ou LibreOffice com detecção automática) | |
| 24 | duplicar gera rascunho sem inscrições | browser | |
| 25 | modo check-in usável no celular | aparelho real (em device mode o comportamento de viewport engana) | |
| 26 | vendedor faz check-in e não edita evento | login de vendedor | |

PVO de cada bloco: `npm run preflight`, `npx tsc -b`, `npm run build`, `npm run lint` (sem erro novo contra o merge-base da `develop`), `npm test`, `npx --yes deno test` nos `_shared/events`, diff revisado e teste no browser no staging.

## Entrega final

O que ficou pronto, o que ficou pendente, link de uma página pública de teste no staging e esta tabela preenchida.

## Fora do escopo

Tudo da seção 11 do PRD (Fase 2) e da seção 10 (fora da Fase 1). Também: ajuste manual do enquadramento do banner, Realtime no check-in, bloqueio de saída pelo menu lateral, "Campo do negócio" como destino.

## Decisões tomadas (preencher durante a execução)

| Data | Decisão | Motivo |
|---|---|---|
| 16/11/2026 | Bloco (b): o dispatcher só grava em `veltzy.messages` o que foi enviado; falha com nova tentativa não aparece no Inbox | três tentativas com backoff gerariam três bolhas vermelhas na conversa; o status fica em `event_messages` |
| 16/11/2026 | Bloco (b): mensagem desligada no editor depois de enfileirada vira `canceled` no envio | o organizador desligou; enviar o texto antigo seria pior |
| 16/11/2026 | Bloco (b): `event-admin-register` recebe `event_id` (não `slug`), e a empresa do evento tem de ser a do usuário também para super_admin | o admin já tem o id; a RPC exige ator do próprio tenant |
| 16/11/2026 | Bloco (b): honeypot e tempo mínimo rodam antes do zod | barra robô sem custo de parse; o resultado (`400 rejected`) é o mesmo |
| 16/11/2026 | Bloco (b): textos de aceite (Política e marketing) montados no servidor, com o nome do organizador; o cliente não manda texto | o registro de consentimento é prova LGPD e não pode vir do navegador |
| 16/11/2026 | Bloco (b): `_shared/events/clients.ts` tipa os clientes pelo próprio `createClient` | o lint proíbe `any`, e `SupabaseClient` genérico não aceita o schema `veltzy` |
| 18/11/2026 | Bloco (c2): sair do editor pelo menu lateral com alterações pendentes não é bloqueado; `beforeunload` e diálogo só na breadcrumb do próprio editor | `BrowserRouter` não tem `useBlocker` (já previsto na SPEC) |
| 18/11/2026 | Bloco (c2): a tag do evento acompanha o título ao salvar enquanto for a automática (`Evento: <título>`); personalizada não muda | rascunho nasce com "Evento: Novo evento" e ficaria com a tag do título antigo |
| 18/11/2026 | Bloco (c2): o slug acompanha o título só em rascunho e só enquanto ninguém editar o slug | publicado, trocar o link quebra quem já recebeu |
| 18/11/2026 | Bloco (c2): o formulário de inscrição grava em dois passos (DELETE dos removidos e depois um upsert de todos), sem transação | sem RPC de lote no Hub; o DELETE primeiro libera a chave pré-definida e o limite de 30; falha no meio deixa o formulário parcial e o Salvar seguinte corrige |
| 18/11/2026 | Bloco (c2): opção gravada sem `tag`/`priority` (chave ausente) é lida como `null` | evento criado por SQL no teste do bloco (b) tinha opção sem as chaves e travava a validação |
| 18/11/2026 | Bloco (c3): logo e banner sobem no bucket assim que escolhidos; o caminho só vale no evento depois do Salvar. Imagem trocada, removida ou não salva fica no bucket | sem apagar arquivo na Fase 1 (a policy permite, mas o arquivo pode estar no evento salvo); limpeza fica para depois |
| 18/11/2026 | Bloco (c3): sem sessão escolhida, a aba 4 preenche a primeira WAHA `connected` e marca "Alterações não salvas" | a SPEC pede padrão na primeira conectada; gravar sem o Salvar seria escrita escondida |
| 18/11/2026 | Bloco (c3): "Criar pipeline para este evento" salva antes as alterações pendentes | a RPC grava direto no evento e o recarregamento reiniciaria o formulário |
| 18/11/2026 | Bloco (c3): a tag digitada na aba 4 vale; sem edição, a tag automática acompanha o título | completa a regra do c2 agora que o campo existe |
| 18/11/2026 | Bloco (c3): o "Próximo" do rodízio só aparece com a fila salva; a ordem do sorteio é `position, user_id`, a mesma do `register_for_event` | o `rr_cursor` aponta para a fila do banco, não para a da tela |
| 18/11/2026 | Bloco (c3): o tema do evento redefine os tokens de cor no próprio container (`src/lib/events/event-theme.ts`); a página pública (bloco e) usa o mesmo | o preview tem de seguir o tema do evento, não o do app |
| 19/11/2026 | Bloco (d): abas 5 a 7 ficam fora do bloqueio de edição; o vendedor faz check-in, vê divulgação e painel, sem criar código nem adicionar inscrito | critério 26: vendedor faz check-in e não edita o evento |
| 19/11/2026 | Bloco (d): divulgadores, painel, CSV e check-in leem todas as inscrições do evento em páginas de 1000 (uma consulta compartilhada); a tabela de inscritos pagina de 50 no banco | uma leitura serve quatro telas; a tabela filtra e busca no servidor |
| 19/11/2026 | Bloco (d): a aba Divulgação usa o evento salvo, não o formulário | o link e o texto valem para o que está no ar |
| 19/11/2026 | Bloco (d): cabeçalho do modo check-in em `bg-primary` | não há token escuro nos três temas; `bg-foreground` ficava claro no tema escuro |
| 19/11/2026 | Bloco (d): `RegistrationFormFields` (inscrição manual) já é o componente da página pública; o bloco (e) só acrescenta os aceites e o envio | SPEC pede o mesmo formulário nos dois lugares |
| 19/11/2026 | Bloco (e): tema e cores da página pública pelo `eventPageStyle` (redefine os tokens no container), não por `--ev-primary`/`--ev-bg`/`--ev-btn-text` | o mesmo mecanismo do preview da aba 3; os campos do formulário (que usam tokens) seguem o tema do evento sem duplicar estilo |
| 19/11/2026 | Bloco (e): "Confirmar presença" aparece com `can_confirm` e menos de 48 h para o início (a janela é do front; o banco só exige antes do fim). O link `?confirmar=1` confirma a qualquer momento | a SPEC pede as 48 h na tela; o link do lembrete já chega dentro da janela |
| 19/11/2026 | Bloco (e): `api/event-og.ts` testado por `src/lib/events/event-og.test.ts` (o vitest só lê `src/`); por esse import o `tsc -b` também checa o arquivo | `api/` fica fora do tsconfig do app; o teste garante tipo e comportamento |
| 19/11/2026 | Bloco (e): o Open Graph só pode ser conferido num deploy da Vercel (preview ou develop); no localhost a rota `/e/:slug` cai direto no React | a função roda no edge da Vercel |
