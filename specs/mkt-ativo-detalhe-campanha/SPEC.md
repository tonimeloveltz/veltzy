# SPEC: Tela de detalhe da campanha (mkt-ativo)

Trilha: M
Início: 2026-10-03 15:30
Merge: (preencher no merge)

## Contexto

O mkt-ativo (disparo em massa por WhatsApp) hoje tem só a **lista** de campanhas
(`src/pages/campanhas.tsx`): nome, template, status e `enviados/total`. Não há como
abrir uma campanha e **ver por contato** o que foi enviado, para quem, em que status
e com qual mensagem renderizada — o passo "ver resposta/agir" que falta para a feature
ficar vendável.

O que já existe e será reaproveitado:
- **Service** `src/services/campaigns.service.ts`: `getCampaigns` (com `template:template_id(...)` embedado),
  `getRecipients(campaignId)` (lista crua de `blast_recipients`, sem nome do lead nem content).
- **Hook** `src/hooks/use-campaigns.ts`: padrão React Query (`useCampaigns`, `staleTime`).
- **Cliente** `veltzy()` em `src/lib/supabase` — client no schema `veltzy` (todas as tabelas do CRM).
- **Router** `src/App.tsx`: `<Routes>` declarativo, já com **precedente de rota-param** (`/inbox/:leadId`)
  e gate por role na rota `/campanhas` (`requireRole admin/manager/super_admin`).
- **Gate de UI** em `campanhas.tsx`: early-return "Campanhas não habilitadas" quando
  `!features?.mkt_ativo_enabled` (o gate autoritativo é server-side na edge `blast-dispatch`).
- **Badges de status de campanha**: `statusLabel`/`statusTone`/`StatusBadge` hoje inline em `campanhas.tsx`.

Fatos do schema confirmados por leitura (read-only) no Central:
- `veltzy.blast_recipients(id, campaign_id, lead_id, phone, status, message_queue_id, error_message, sent_at, created_at)`.
  Status: `pending | queued | sent | failed | skipped` (type `BlastRecipientStatus` já existe em `database.ts`).
- **FKs presentes** (habilitam embedding PostgREST): `lead_id → veltzy.leads(id)` e
  `message_queue_id → veltzy.message_queue(id)`.
- `veltzy.message_queue(id, lead_id, content, message_type, status, error_message, sent_at, metadata)`.
  `content` = texto renderizado pela edge no disparo.

## O que entra / o que não entra

**Entra:**
- Rota dedicada `/campanhas/:id` (padrão rota-param, igual `/inbox/:leadId`) com a tela de detalhe.
- Linha da lista (`campanhas.tsx`) clicável → navega para o detalhe.
- Cabeçalho do detalhe: nome, template, status da campanha, datas (criada / iniciada / concluída).
- Cards de agregados no topo: **total / enviados / na fila / falhas / pulados**.
- Tabela de recipients: nome do lead (ou "Sem nome"), telefone, status (badge), **content renderizado**
  (via `message_queue_id → message_queue.content`) e `error_message` quando `failed`.
- Empty state (campanha sem recipients, ex.: draft nunca disparada) e loading skeleton.
- Gate: mesma regra da lista (`mkt_ativo_enabled` na página + `requireRole` no router).

**Não entra:**
- Nenhuma migration / coluna / tabela nova. **Só leitura** de tabelas existentes.
- Nenhum dado pessoal novo.
- Ações sobre a campanha no detalhe (reenviar, cancelar, pausar, retry de falha) — Onda futura.
- Realtime/polling do status — a tela revalida ao navegar (padrão do app); refresh manual fica para depois.
- Qualquer alteração na edge `blast-dispatch` ou no fluxo de envio.

## Arquivos
<!-- arquivos -->
src/services/campaigns.service.ts
src/hooks/use-campaigns.ts
src/pages/campanha-detalhe.tsx
src/components/campanhas/campaign-summary-cards.tsx
src/components/campanhas/recipient-list.tsx
src/pages/campanhas.tsx
src/App.tsx
<!-- /arquivos -->

## O que fazer em cada arquivo

Na ordem de implementação:

1. **`src/services/campaigns.service.ts`** (mod)
   - Adicionar `getCampaignById(companyId, id)`: retorna uma `CampaignWithTemplate`
     (mesmo embedding `template:template_id(id, name, status)` do `getCampaigns`),
     filtrando `.eq('company_id', companyId).eq('id', id).single()`. Multi-tenant no código, além do RLS.
   - Adicionar `getCampaignRecipientsDetailed(campaignId)`: `blast_recipients`
     com embedding `lead:lead_id(name)` e `queue:message_queue_id(content, status, sent_at, error_message)`,
     `.eq('campaign_id', campaignId).order('created_at', { ascending: false })`.
   - Exportar o type `RecipientDetail` (ver Contratos).

2. **`src/hooks/use-campaigns.ts`** (mod)
   - `useCampaign(id)`: query `['campaign', companyId, id]`, chama `getCampaignById`, `enabled: !!companyId && !!id`.
   - `useCampaignRecipients(id)`: query `['campaign-recipients', id]`, chama `getCampaignRecipientsDetailed`, `enabled: !!id`.

3. **`src/components/campanhas/campaign-summary-cards.tsx`** (novo)
   - Recebe `recipients: RecipientDetail[]`. Deriva os agregados **por status dos recipients**
     (total + sent/queued/failed/skipped/pending) e renderiza cards. (Ver Contratos: por que derivar dos recipients.)

4. **`src/components/campanhas/recipient-list.tsx`** (novo)
   - Recebe `recipients: RecipientDetail[]`. Tabela (mesmo estilo da lista de `campanhas.tsx`):
     colunas Contato (nome ou "Sem nome"), Telefone, Status (badge dos 5 estados), Mensagem (`queue.content`,
     célula vazia quando ausente), e `error_message` (recipient.error_message ?? queue.error_message)
     exibido quando `status === 'failed'`.
   - Empty state quando vazio.
   - ⚠️ **Sem em-dash (—) em NENHUMA string de UI** (regra do CLAUDE.md do Veltzy): usar palavra
     ("Sem nome") ou célula vazia; nunca "—".

5. **`src/pages/campanha-detalhe.tsx`** (novo, fino)
   - `useParams()` para o `id`. Mesmo gate `!features?.mkt_ativo_enabled` da lista (early-return).
   - `useCampaign(id)` + `useCampaignRecipients(id)`. Header (nome/template/status/datas) + `<CampaignSummaryCards>` + `<RecipientList>`.
   - Loading com `Skeleton`; campanha inexistente → mensagem "Campanha não encontrada" + voltar para `/campanhas`.
   - Botão/voltar para `/campanhas` (`useNavigate` ou `<Link>`).

6. **`src/pages/campanhas.tsx`** (mod)
   - Linha da tabela clicável → `navigate(\`/campanhas/\${c.id}\`)` (`useNavigate` do react-router-dom).
   - Cursor/hover já existe (`hover:bg-muted/30`); adicionar `cursor-pointer`.

7. **`src/App.tsx`** (mod)
   - Adicionar `const CampanhaDetalhePage = lazy(() => import('@/pages/campanha-detalhe'))`.
   - Rota `/campanhas/:id` dentro do mesmo `ProtectedRoute requireRole={['admin','manager','super_admin']}`
     da rota `/campanhas` (declarar logo após ela).

## Contratos não óbvios

Type do recipient detalhado (no service):
```ts
export interface RecipientDetail extends BlastRecipient {
  lead: { name: string | null } | null
  queue: {
    content: string | null
    status: string | null
    sent_at: string | null
    error_message: string | null
  } | null
}
```

Embedding PostgREST no schema `veltzy` (FKs confirmadas, então os aliases resolvem):
```ts
veltzy()
  .from('blast_recipients')
  .select('*, lead:lead_id(name), queue:message_queue_id(content, status, sent_at, error_message)')
  .eq('campaign_id', campaignId)
  .order('created_at', { ascending: false })
```

**Agregados derivados dos recipients, não dos counts da campanha.** `blast_campaigns`
tem `sent_count/failed_count/total_recipients`, mas esses contadores são reconciliados
pelo cron `process-blast-followups` e podem estar atrás do estado real. A contagem por
status do array de recipients é a fonte fiel ao vivo. Header pode exibir o status da
campanha; os números dos cards vêm dos recipients.

**`error_message`**: preferir `recipient.error_message`; se nulo, cair para `queue.error_message`.

**`content`**: vem de `queue.content` (texto já renderizado no disparo, ex.:
"Olá Fulano, seu pagamento de R$ 150,00 vence amanhã..."). Recipient ainda `pending`/sem
`message_queue_id` → sem content (célula vazia; **nunca "—"**).

**Em-dash proibido**: o CLAUDE.md do Veltzy veta "—" em textos/copy. Nenhuma string de UI
desta tela pode usar em-dash — placeholders viram palavra ("Sem nome") ou célula vazia.

## Critérios de aceite

- [ ] Acessar `/campanhas/:id` (id válido da empresa) abre a tela de detalhe.
- [ ] Clicar numa linha da lista em `/campanhas` navega para o detalhe daquela campanha.
- [ ] Cabeçalho mostra nome, template, badge de status e datas da campanha.
- [ ] Cards de agregados exibem total / enviados / na fila / falhas / pulados, contados dos recipients.
- [ ] Tabela lista cada recipient com nome (ou "Sem nome"), telefone, badge de status e a mensagem renderizada (`content`).
- [ ] Recipient `failed` mostra o `error_message`.
- [ ] Campanha sem recipients (ex.: draft) mostra empty state, sem quebrar.
- [ ] Empresa sem `mkt_ativo_enabled` vê "Campanhas não habilitadas"; role insuficiente é barrado pelo router.
- [ ] `id` inexistente/de outra empresa → "Campanha não encontrada" com link de volta (não vaza dados de outro tenant).
- [ ] Nenhuma string de UI usa em-dash (—).
- [ ] `npx tsc -b` e `npm run build` verdes; `npm run pvo -- specs/mkt-ativo-detalhe-campanha/SPEC.md` passa 1-3.

### Plano de verificação no browser (Playwright)

A campanha de E2E `a9ecbf99` (Veltz Group) fica com **0 recipients até o disparo real**
(depende do curl do Toni, ainda pendente). Portanto:

**Verificável AGORA (sem disparo):**
- [ ] Navegação lista → detalhe (clicar numa linha abre `/campanhas/:id`).
- [ ] Empty state de recipients numa campanha draft (ex.: `a9ecbf99` ou `116a5bbf`).
- [ ] Gate: empresa com `mkt_ativo_enabled` OFF vê "Campanhas não habilitadas".
- [ ] `id` inexistente / de outra empresa → "Campanha não encontrada" + voltar.

**Só DEPOIS do disparo (lista populada):**
- [ ] Recipients com nome, telefone, status `sent`/`failed` e content renderizado.
- [ ] Agregados refletindo os status reais.
- Se o disparo da `a9ecbf99` ocorrer antes do fim do bloco, usar a campanha já populada para a prova completa.
