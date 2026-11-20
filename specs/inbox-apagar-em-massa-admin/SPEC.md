# SPEC: Apagar mensagens em massa só com admin + senha

Trilha: G
Início: 2026-11-20 07:50
Merge: 2026-11-20 11:00

## Contexto
- Bulk: `src/components/inbox/conversations-bulk-action-bar.tsx` + `use-bulk-delete-lead-messages.ts` → `messagesService.deleteMessagesByLeads` (DELETE direto do client em `veltzy.messages`). Seleção liberada para `isManager` (`conversation-list.tsx:40`).
- Unitário ("x" da linha): `DeleteConversationButton` → `deleteLeadMessages` (DELETE direto), `isManager`.
- RLS: `veltzy.messages` tem só `messages_company_isolation` (ALL, authenticated, `company_id = get_current_company_id() OR is_super_admin()`). Qualquer usuário da empresa, inclusive vendedor, apaga via API.

## O que entra / o que não entra
Entra:
- Seleção em massa e "Apagar mensagens" só para admin (`isAdmin`, inclui super_admin). Gestor e vendedor não veem checkbox nem "Selecionar todas".
- Confirmação do bulk pede a senha do próprio admin; validada no servidor.
- Exclusão (bulk e unitária) passa a acontecer só por Edge Function do Veltzy; o DELETE direto do client deixa de existir.
- "x" unitário mantém a regra atual (gestor e admin), sem senha. Toni: "a regra de só admin só vale pra esse botão de apagar tudo de vez".
Não entra: apagar no WhatsApp, anexos do bucket, auditoria em tabela nova.

## Arquivos
<!-- arquivos -->
supabase/functions/inbox-delete-messages/index.ts
supabase/config.toml
src/services/messages.service.ts
src/hooks/use-bulk-delete-lead-messages.ts
src/hooks/use-delete-lead-messages.ts
src/components/inbox/conversations-bulk-action-bar.tsx
src/components/inbox/conversation-list.tsx
<!-- /arquivos -->
Hub: `supabase/migrations/<ts>_veltzy_messages_delete_so_servidor.sql`

## Blocos e ordem
- **D1 (Veltzy)**: edge + front. Deploy da edge no staging. Front passa a chamar a edge.
- **D2 (Hub)**: migration de RLS no staging. Só depois de D1 no staging (senão o "x" quebra).
- Produção: Veltzy (front + edge via CI da main) antes do Hub (migration via CI da main do Hub).

## O que fazer em cada arquivo

**`supabase/functions/inbox-delete-messages/index.ts`** (nova, `verify_jwt = true`, padrão CORS do repo)
Body: `{ lead_ids: string[], password?: string }`.
1. `auth.getUser(jwt)` → user. Carregar `profiles.company_id` e roles (`user_roles`) com service role.
2. `lead_ids.length === 0` → 400. Todos os leads precisam ser da `company_id` do usuário (SELECT conta); divergência → 403.
3. Regra:
   - `lead_ids.length > 1` (bulk): exige role `admin` ou `super_admin`, e `password` obrigatório. Verificar com client anon novo, `auth.signInWithPassword({ email: user.email, password })`; erro → 401 `{ error: 'senha_invalida' }`. Descartar a sessão criada (`signOut` no client anon local, sem afetar a sessão do browser).
   - `lead_ids.length === 1` (unitário): exige `manager`, `admin` ou `super_admin`. Sem senha.
4. DELETE em `veltzy.messages` com service role, em lotes de 50, `count: 'exact'`, filtrando `company_id`. Retorna `{ deleted }`.
5. `console.log` estruturado `[inbox-delete-messages] user=<id> company=<id> leads=<n> deleted=<n> mode=bulk|single` (sem conteúdo).
Rate limit simples: não. Senha errada não revela se o email existe (mesma mensagem).

**`supabase/config.toml`**: declarar `[functions.inbox-delete-messages] verify_jwt = true` (explícito; memória: proxy nasce sem declaração).

**`src/services/messages.service.ts`**: `deleteLeadMessages` e `deleteMessagesByLeads` passam a `supabase.functions.invoke('inbox-delete-messages', { body })`. Assinatura nova do bulk aceita `password`. Mapear 401 `senha_invalida` para erro tipado (`InvalidPasswordError`).

**`use-bulk-delete-lead-messages.ts` / `use-delete-lead-messages.ts`**: repassar `password`; `onError` com `InvalidPasswordError` → toast "Senha incorreta" e manter o diálogo aberto (o componente decide).

**`conversations-bulk-action-bar.tsx`**: no AlertDialog, campo "Sua senha" (`type="password"`, `autoComplete="current-password"`), botão Apagar desabilitado sem senha. Texto: "Para confirmar, digite a sua senha de acesso." Senha errada: mensagem inline sob o campo, diálogo continua aberto, campo limpo. Fechar o diálogo limpa a senha.

**`conversation-list.tsx`**: `canSelect = isAdmin` (comentário atualizado: "x" da linha segue `isManager`).

### D2 (Hub)
Migration:
```sql
DROP POLICY IF EXISTS messages_company_isolation ON veltzy.messages;
CREATE POLICY messages_select ON veltzy.messages FOR SELECT TO authenticated
  USING (company_id = get_current_company_id() OR is_super_admin());
CREATE POLICY messages_update ON veltzy.messages FOR UPDATE TO authenticated
  USING (company_id = get_current_company_id() OR is_super_admin())
  WITH CHECK (company_id = get_current_company_id() OR is_super_admin());
-- Sem messages_insert: a policy "Members can insert messages" ja cobre.
-- Sem policy de DELETE: exclusao so pela edge inbox-delete-messages (service role).
REVOKE DELETE, TRUNCATE ON veltzy.messages FROM authenticated, anon;
```
Antes de escrever: conferir no staging se a policy atual tem `WITH CHECK` próprio e se há outras policies/funções que fazem DELETE em `veltzy.messages` como `authenticated` (RPCs SECURITY INVOKER, triggers). Cascade de FK não é afetado por RLS. `supabase db push` no staging, `gen types` (Veltzy não precisa regenerar: sem mudança de tipo).

## Critérios de aceite
- [ ] Gestor e vendedor: sem checkbox e sem "Selecionar todas" no inbox.
- [ ] Admin: seleciona, clica Apagar, diálogo pede senha; senha errada → "Senha incorreta", nada apagado; senha certa → apaga e mostra contagem.
- [ ] Gestor continua apagando uma conversa pelo "x", sem senha.
- [ ] Vendedor chamando a edge (ou DELETE direto pela API) não apaga nada.
- [ ] Gestor chamando a edge com 2+ leads → 403.
- [ ] Lead de outra empresa no payload → 403.
- [ ] Após D2 no staging: DELETE direto em `veltzy.messages` como authenticated apaga 0 linhas.
- [ ] Build verde, `deno check` sem erro novo.

## Decisões tomadas
- Senha validada no servidor (signInWithPassword na edge), não só no front: a ameaça é apagar histórico, e o front sozinho não protege.
- A senha é a do próprio admin logado: só admin vê a opção, então "senha de algum admin" = a dele.
- Servidor decide por quantidade: 2+ leads = bulk (admin + senha), 1 = unitário (gestor+). A barra, só visível a admin, sempre pede senha, mesmo com 1 selecionada; o servidor ignora a senha extra no unitário. Gestor apagando uma a uma pelo "x" é o comportamento atual, mantido por decisão do Toni.
- Unitário também migra para a edge: tirar a policy de DELETE quebraria o DELETE direto.
- Sem tabela de auditoria nova: log estruturado na edge basta para agora.
- Edge aceita `company_id` no body só para super_admin (impersonação); para os demais vale `profiles.company_id`, e `company_id` divergente no body → 403.
- `lead_ids` deduplicados e filtrados (só string não vazia) antes da contagem de posse; posse conferida em lotes de 50.
- Senha errada: só a mensagem inline "Senha incorreta" sob o campo (sem toast duplicado); o hook não tosta `InvalidPasswordError`.
- Erro diferente de senha fecha o diálogo e mantém a seleção (toast "Erro ao apagar mensagens").
- Enter no campo de senha confirma (form com submit); botão desabilitado sem senha.
- `signOut({ scope: 'local' })` no client anon descartável (`persistSession: false`): não revoga a sessão do browser.
- Débito: a policy "Members can view messages" (vendedor só vê os próprios leads) está anulada pela ALL atual e continua anulada por `messages_select`; decidir em outra frente.
