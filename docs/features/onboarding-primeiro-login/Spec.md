# Spec — Onboarding de primeiro login (Onda 1, essencial)

> Ref PRD: `docs/features/onboarding-primeiro-login/PRD.md`
> Data: 2026-10-19 · Status: aguardando revisão

## Resumo executivo
O admin de empresa nova é redirecionado no primeiro login para um wizard de 5 telas: boas-vindas, conectar WhatsApp (com teste opcional de mensagem real), convidar equipe (opcional), importar planilha (opcional) e pronto. Ele pode pular a qualquer momento. Toda empresa sem número conectado vê um aviso "Termine de configurar" na página Admin.

## Pré-condições
- `develop` limpa, `npx tsc -b` e `npm run build` verdes antes de começar.
- Branch `feat/onboarding-primeiro-login` a partir de `develop`. Se a origem for remota, use `--no-track`.
- `public.companies.metadata jsonb` existe no Central (baseline do Hub, linha ~2957). **Nenhuma migration nesta Spec.**
- Policy `Admins can update own company` (baseline do Hub, linha ~7009) permite UPDATE em `companies` para o admin da empresa ativa.
- No staging: uma empresa criada via `provision-company` **depois** de `ONBOARDING_CUTOFF` e sem número, para o PVO.

## Regra central (decide tudo)

```
candidato  = papel 'admin' na empresa ativa
           E NÃO tem papel 'super_admin'
           E company.created_at >= ONBOARDING_CUTOFF
           E metadata.onboarding.skipped_at ausente
           E metadata.onboarding.completed_at ausente

mostraWizard = candidato E lista de números carregou sem erro E lista vazia (nenhum número, qualquer status)

mostraAviso  = usuário isAdmin (inclui super_admin)
             E lista de números carregou sem erro
             E nenhum número com status === 'connected'
```

Fail-open: em loading ou erro na lista de números, **não** redireciona e **não** mostra aviso.

## Arquivos a criar

### `src/lib/onboarding.ts` (novo)
**Propósito:** constante de corte e funções puras da regra. Sem React e sem Supabase, para dar teste unitário.

**Snippet de referência:**
```ts
import type { AppRole, Company, CompanyOnboarding } from '@/types/database'
import type { WhatsAppNumberItem } from '@/services/whatsapp-numbers.service'

// Empresas criadas antes disso nunca veem o wizard (PRD D4). Meia-noite em Sao Paulo.
export const ONBOARDING_CUTOFF = '2026-10-19T03:00:00Z'

export const getOnboardingFlags = (company: Company | null): CompanyOnboarding =>
  company?.metadata?.onboarding ?? {}

export const isOnboardingCandidate = (roles: AppRole[], company: Company | null): boolean => {
  if (!company) return false
  if (!roles.includes('admin') || roles.includes('super_admin')) return false
  if (new Date(company.created_at).getTime() < new Date(ONBOARDING_CUTOFF).getTime()) return false
  const flags = getOnboardingFlags(company)
  return !flags.skipped_at && !flags.completed_at
}

export const hasConnectedNumber = (numbers: WhatsAppNumberItem[]): boolean =>
  numbers.some((n) => n.status === 'connected')
```

### `src/lib/onboarding.test.ts` (novo)
**Propósito:** cobrir a regra com vitest (`npm run test:run`).
**Casos obrigatórios** de `isOnboardingCandidate`:
1. admin, criada depois do corte, sem flags → `true`
2. admin, criada **antes** do corte → `false`
3. admin com `skipped_at` → `false`
4. admin com `completed_at` → `false`
5. `['admin', 'super_admin']` → `false`
6. `['seller']` → `false`
7. `company = null` → `false`
8. `metadata = null` (empresa antiga, coluna vazia) → não lança, segue as outras regras

E de `hasConnectedNumber`: lista vazia → `false`; só `qr_pending`/`disconnected` → `false`; um `connected` → `true`.

### `src/services/onboarding.service.ts` (novo)
**Propósito:** gravar `skipped_at` ou `completed_at` em `companies.metadata.onboarding` sem apagar outras chaves.
**O que implementar:**
- Ler `metadata` fresco do banco (não usar o do store), fazer o merge e gravar.
- `.select('metadata')` no update e conferir que voltou **exatamente 1 linha**. Se a RLS barrar, o update volta 0 linhas sem erro (ver memória "contar linhas aceitas").
- Filtrar por `id = companyId` (regra multi-tenant).

**Snippet de referência:**
```ts
import { supabasePublic as supabase } from '@/lib/supabase'
import type { CompanyMetadata } from '@/types/database'

export type OnboardingMark = 'skipped_at' | 'completed_at'

export const markOnboarding = async (companyId: string, mark: OnboardingMark): Promise<CompanyMetadata> => {
  const { data: current, error: readError } = await supabase
    .from('companies')
    .select('metadata')
    .eq('id', companyId)
    .single()
  if (readError) throw readError

  const metadata: CompanyMetadata = current?.metadata ?? {}
  const next: CompanyMetadata = {
    ...metadata,
    onboarding: { ...metadata.onboarding, [mark]: new Date().toISOString() },
  }

  const { data, error } = await supabase
    .from('companies')
    .update({ metadata: next })
    .eq('id', companyId)
    .select('metadata')
  if (error) throw error
  if (!data || data.length !== 1) throw new Error('Nao foi possivel salvar o progresso da configuracao.')
  return next
}
```

**Segunda função no mesmo arquivo**, para o teste de mensagem real. Busca o lead mais recente da empresa criado depois de `since`:
```ts
import { veltzy } from '@/lib/supabase'

export interface OnboardingTestLead {
  id: string
  name: string | null
  phone: string
}

export const getFirstLeadSince = async (companyId: string, since: string): Promise<OnboardingTestLead | null> => {
  const { data, error } = await veltzy()
    .from('leads')
    .select('id, name, phone')
    .eq('company_id', companyId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}
```
- Filtra por `company_id` explicitamente (a RLS não é a única defesa).
- `since` evita confundir o teste com um lead que já existia. Numa empresa nova isso não deveria acontecer, mas o super admin pode abrir o wizard numa empresa qualquer.

### `src/hooks/use-onboarding-status.ts` (novo)
**Propósito:** diz ao gate se deve redirecionar.
**O que implementar:**
- Lê `roles` e `company` de `useAuthStore`.
- `const candidate = isOnboardingCandidate(roles, company)`.
- `useWhatsAppNumbers({ enabled: candidate })`. **Só consulta se for candidato**, para não pesar o login de todo mundo.
- Retorna `{ isChecking: candidate && isLoading, needsWizard: candidate && !isError && data !== undefined && data.length === 0 }`.

### `src/hooks/use-first-inbound-lead.ts` (novo)
**Propósito:** polling do teste de mensagem real.
**O que implementar:**
```ts
export const useFirstInboundLead = (since: string, enabled: boolean) => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['onboarding-test-lead', companyId, since],
    queryFn: () => getFirstLeadSince(companyId!, since),
    enabled: !!companyId && enabled,
    // Para de consultar assim que achou o lead.
    refetchInterval: (query) => (query.state.data ? false : 3_000),
  })
}
```

### `src/hooks/use-mark-onboarding.ts` (novo)
**Propósito:** mutation que chama `markOnboarding` e atualiza o `company` do store.
**O que implementar:**
- `mutationFn: (mark: OnboardingMark) => markOnboarding(company.id, mark)`.
- `onSuccess(metadata)`: `setCompany({ ...company, metadata })`.
- `onError`: **também** chama `setCompany` com o merge local (mesmo formato do service), mais `toast.error(err.message)`. Sem isso, se a gravação falhar, o gate redireciona de volta para `/onboarding` e a pessoa fica presa num loop. A flag local vale só para a sessão, e o wizard pode reaparecer no próximo login. Isso é aceitável e melhor que o loop.
- Um hook por arquivo (CLAUDE.md).

### `src/components/onboarding/onboarding-gate.tsx` (novo)
**Propósito:** envolve o `MainLayout` e redireciona o candidato.
**Snippet de referência:**
```tsx
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useOnboardingStatus } from '@/hooks/use-onboarding-status'

interface OnboardingGateProps {
  children: React.ReactNode
}

export const OnboardingGate = ({ children }: OnboardingGateProps) => {
  const { isChecking, needsWizard } = useOnboardingStatus()

  if (isChecking) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }
  if (needsWizard) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}
```

### `src/components/onboarding/onboarding-wizard.tsx` (novo)
**Propósito:** casca do wizard, com estado da etapa, barra de progresso e navegação.
**O que implementar:**
- `const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0)` (estado efêmero de UI, sem Zustand).
- Layout de tela cheia **sem sidebar**: `min-h-dvh bg-background`, conteúdo centralizado `max-w-2xl mx-auto p-4 sm:p-6`, logo/nome da empresa no topo.
- `<Progress value={((step + 1) / 5) * 100} />` (já existe em `components/ui/progress.tsx`) e o texto "Etapa {step + 1} de 5".
- Renderiza `StepWelcome` (0), `StepWhatsapp` (1), `StepTeam` (2), `StepImport` (3) ou `StepDone` (4) conforme `step`.
- Ações:
  - `onSkip` (`step` 0 e 1): `mark.mutate('skipped_at', { onSettled: () => navigate('/', { replace: true }) })`. Encerra o onboarding.
  - `step` 2 (`StepTeam`) e 3 (`StepImport`): `onNext={() => setStep(step + 1)}`. Estas telas **não** gravam flag nenhuma. Tanto "Pular esta etapa" quanto "Continuar" só avançam.
  - `onFinish` (`step` 4): `mark.mutate('completed_at', { onSettled: () => navigate('/pipeline', { replace: true }) })`.
  - Botões desabilitados enquanto `mark.isPending`.
- Ficar abaixo de ~200 linhas. As telas ficam nos arquivos abaixo.

### `src/components/onboarding/step-welcome.tsx` (novo)
**Props:** `interface StepWelcomeProps { userName: string; onStart: () => void; onSkip: () => void; disabled: boolean }`
**Copy (sem em dash):**
- Título: `Bem-vindo ao Veltzy, {primeiro nome}`
- Texto: `Seu funil já está pronto, com as etapas de venda configuradas. Para os leads começarem a chegar, falta conectar o WhatsApp da sua empresa. Depois, se quiser, você convida a equipe e traz seus contatos de uma planilha.`
- Botões: `Fazer depois` (variant ghost) e `Começar` (primário).

### `src/components/onboarding/step-whatsapp.tsx` (novo)
**Props:** `interface StepWhatsappProps { onContinue: () => void; onSkip: () => void; disabled: boolean }`
**O que implementar:**
- Título: `Conecte seu WhatsApp`. Subtítulo: `É por ele que os leads chegam e que você e sua equipe respondem.`
- Renderiza **`<WhatsAppNumbersList />` como está**. Ele já trata as categorias liberadas no Hub, o estado vazio, "fale com o suporte" e todos os dialogs de conexão.
- `useWhatsAppNumbers({ refetchInterval: 5_000 })` para enxergar a conexão. Os dialogs da Evolution e da API Oficial não invalidam `['whatsapp-numbers']`, e esta Spec não mexe neles.
- Linha informativa (texto `text-xs text-muted-foreground`): `Ao conectar pela API Oficial, a Meta pode oferecer a importação do histórico recente de conversas desse número.`
- Rodapé: `Fazer depois` (ghost) e `Continuar` (primário, `disabled={disabled || !hasConnectedNumber(data ?? [])}`).
- Quando há número `connected`, renderizar `<WhatsappTestPanel />` acima do rodapé. O teste é **opcional**: `Continuar` já fica habilitado só com o número conectado e não espera pelo teste.

### `src/components/onboarding/whatsapp-test-panel.tsx` (novo)
**Propósito:** teste de ponta a ponta. Prova que a mensagem chega no Veltzy, e não só que o número está `connected`. Entre os dois existem o webhook do Hub e o roteamento para o funil, que podem falhar em silêncio.
**O que implementar:**
- `const [since] = useState(() => new Date().toISOString())`, fixado quando o painel monta (ou seja, quando o número conectou).
- `const { data: lead } = useFirstInboundLead(since, true)`.
- **Esperando** (`!lead`): ícone `Loader2 animate-spin text-muted-foreground`, título `Faça um teste`, texto `Mande um "oi" de outro celular para o número que você acabou de conectar. Ele vai aparecer aqui em alguns segundos.`
- **Chegou** (`lead`): ícone `CheckCircle2 text-primary`, título `Chegou! Esse é o seu primeiro lead`, e a linha `{lead.name ?? 'Sem nome'} · {lead.phone}`. Texto: `Ele já está no Inbox e no Pipeline.`
- Sem botão próprio. O painel só informa, e o avanço continua pelo `Continuar` da tela.
- Sem link para o Inbox: sair do wizard por um link no meio deixaria o onboarding sem flag. Não prende ninguém, porque o gate não redireciona quem já tem número, mas perde o resto das etapas.

### `src/components/onboarding/step-team.tsx` (novo)
**Props:** `interface StepTeamProps { onNext: () => void }`
**Propósito:** etapa opcional para convidar vendedores. Reaproveita **`InviteMemberModal` sem alteração** (`src/components/sellers/invite-member-modal.tsx`, props `open` e `onClose`). Ele já valida o e-mail, permite escolher o papel (seller, manager, admin), checa o teto de usuários do plano (`check_company_limits`, com o erro exibido em toast pelo `useInviteMember`) e envia o e-mail.
**O que implementar:**
- `const [modalOpen, setModalOpen] = useState(false)` e `const { data: invites } = useInvites()` (hook existente em `use-team.ts`).
- Título: `Convide sua equipe`
- Texto: `Os leads novos são distribuídos automaticamente entre os vendedores disponíveis. Sem equipe, todos ficam com você.`
- Botão secundário `Convidar pessoa` → `setModalOpen(true)`. Pode ser usado várias vezes.
- Lista simples dos convites pendentes, vindos de `useInvites()` e filtrados por `status === 'pending'`: e-mail e papel, uma linha cada. A lista se atualiza sozinha, porque `useInviteMember` invalida `['team-invites']`.
- Linha informativa (`text-xs text-muted-foreground`): `Cada pessoa recebe um e-mail e entra na equipe quando aceitar o convite.`
- `<InviteMemberModal open={modalOpen} onClose={() => setModalOpen(false)} />`.
- Rodapé: `Pular esta etapa` (ghost) se não houver convite pendente, e `Continuar` (primário) se houver. Os dois chamam `onNext`.

### `src/components/onboarding/step-import.tsx` (novo)
**Props:** `interface StepImportProps { onNext: () => void }`
**Propósito:** etapa opcional para subir planilha de contatos e negócios. Reaproveita **`ImportLeadsModal` sem nenhuma alteração**. Ele já faz upload .xlsx/.csv, planilha modelo, mapeamento de colunas, checagem de duplicados por telefone, confirmação de responsáveis, criação de lead e deal, e tela de resultado.
**O que implementar:**
- Estado local: `const [modalOpen, setModalOpen] = useState(false)` e `const [imported, setImported] = useState(false)`.
- Título: `Já tem uma carteira de clientes?`
- Texto: `Suba uma planilha com seus contatos e negócios para eles já aparecerem no funil. Se preferir, baixe a planilha modelo dentro da importação e preencha.`
- Linha LGPD (`text-xs text-muted-foreground`): `Importe apenas contatos com quem sua empresa já tem relação ou autorização para falar.`
- Linha sobre responsável (`text-xs text-muted-foreground`), exibida **só se houver convite pendente** (`useInvites()` com `status === 'pending'`): `A coluna "Responsável" só reconhece quem já aceitou o convite. Os contatos dos demais ficam com você e podem ser redistribuídos depois.` Motivo: `resolveAssignees` casa nomes com `useTeamMembers()` (profiles com `company_id`), e um convidado que ainda não aceitou não está lá.
- Botão secundário `Importar planilha` → `setModalOpen(true)`.
- `<ImportLeadsModal open={modalOpen} onClose={() => { setModalOpen(false); setImported(true) }} />`. O modal já impede fechar durante a importação (`if (isPending) return`).
- Rodapé: `Pular esta etapa` (ghost) quando `!imported`. Quando `imported`, troca por `Continuar` (primário). Os dois chamam `onNext`.
- `imported` só controla o rótulo do botão. Se a pessoa abriu e fechou o modal sem importar, ver `Continuar` não causa problema, porque a etapa é opcional e não grava nada.

### `src/components/onboarding/step-done.tsx` (novo)
**Props:** `interface StepDoneProps { onFinish: () => void; disabled: boolean }`
**Copy:**
- Título: `Tudo pronto`
- Texto: `Os leads que chamarem no seu WhatsApp vão aparecer no Inbox e no Pipeline. Ligar a IA SDR, cadastrar produtos e ajustar as regras de distribuição você faz quando quiser, pelos menus Admin e Gestão.`
- Botão: `Ir para o Pipeline`.

### `src/pages/onboarding.tsx` (novo)
**Propósito:** página fina, só composição.
```tsx
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'

const OnboardingPage = () => <OnboardingWizard />

export default OnboardingPage
```

### `src/components/admin/setup-pending-banner.tsx` (novo)
**Propósito:** aviso "Termine de configurar" no topo da página Admin, para empresa nova que pulou ou empresa antiga sem número.
**O que implementar:**
- `const { isAdmin } = useRoles()`, `const { data, isLoading, isError } = useWhatsAppNumbers()`.
- Retorna `null` se `!isAdmin || isLoading || isError || !data || hasConnectedNumber(data)`.
- Card com tokens (sem cor direta): `border-primary/40 bg-primary/5`, ícone `AlertCircle text-primary`.
- Copy: título `Termine de configurar`. Texto: `Conecte um número de WhatsApp para receber leads e responder pelo Veltzy.`
- Botão `Conectar agora` → abre `<ConnectNumberDialog open onOpenChange />` (estado local `useState(false)`), o mesmo seletor usado em Integrações.

## Arquivos a modificar

### `src/types/database.ts`
**O que mudar** (perto da `interface Company`, linha ~165):
- Adicionar antes da `Company`:
```ts
export interface CompanyOnboarding {
  skipped_at?: string
  completed_at?: string
}

export interface CompanyMetadata {
  onboarding?: CompanyOnboarding
  [key: string]: unknown
}
```
- Na `Company`, adicionar `metadata: CompanyMetadata | null`.
- **Não remover** `settings` da `Company`, mesmo que a coluna não exista no banco. Ver "Achados fora de escopo".

### `src/hooks/use-whatsapp-numbers.ts`
**O que mudar:** só `useWhatsAppNumbers` (linhas 12-21), aceitando opções sem mudar o comportamento de quem chama sem argumento:
```ts
interface UseWhatsAppNumbersOptions {
  enabled?: boolean
  refetchInterval?: number
}

export function useWhatsAppNumbers({ enabled = true, refetchInterval }: UseWhatsAppNumbersOptions = {}) {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['whatsapp-numbers', companyId],
    queryFn: listWhatsAppNumbers,
    enabled: !!companyId && enabled,
    staleTime: 30_000,
    refetchInterval,
  })
}
```
Os demais hooks do arquivo ficam intocados.

### `src/App.tsx`
**O que mudar:**
1. Import lazy junto dos outros (linha ~33): `const OnboardingPage = lazy(() => import('@/pages/onboarding'))`.
2. Import: `import { OnboardingGate } from '@/components/onboarding/onboarding-gate'`.
3. Rota nova **fora** do `MainLayout`, logo depois da rota `/update-password` (linha ~85):
```tsx
<Route
  path="/onboarding"
  element={
    <ProtectedRoute requireRole={['admin', 'super_admin']}>
      <OnboardingPage />
    </ProtectedRoute>
  }
/>
```
4. Na rota de layout (linhas ~87-92), envolver o `MainLayout`:
```tsx
<ProtectedRoute>
  <OnboardingGate>
    <MainLayout />
  </OnboardingGate>
</ProtectedRoute>
```

### `src/pages/admin.tsx`
**O que mudar:** importar `SetupPendingBanner` e renderizar entre o `<h1>Admin</h1>` e o `<Tabs>` (linha ~45). Mais nada.

## Arquivos a NÃO tocar
- `supabase/` inteiro: sem migration, sem edge function. Se algo pedir migration, pare e reporte: migration do Central mora no Hub.
- `src/stores/auth.store.ts`: o `select('*')` já traz `metadata`. Use o `setCompany` existente.
- `src/components/auth/protected-route.tsx`: o gate é componente separado, não um parâmetro novo aqui.
- `src/components/admin/whatsapp-numbers-list.tsx`, `connect-number-dialog.tsx`, `whatsapp-connect-dialog.tsx`, `waha-connect-dialog.tsx`, `official-manage-dialog.tsx`, `whatsapp-embedded-signup.tsx`: reusar como estão. O problema da invalidação é resolvido com polling na tela 2.
- `src/components/pipeline/import-leads-modal.tsx`, `src/components/pipeline/import-steps/*`, `src/hooks/use-import-leads.ts`, `src/services/import-leads.service.ts`: reusar o modal como está. Ele já é usado em 3 telas, e qualquer mudança aqui afeta Pipeline, Contatos e Negócios.
- `src/components/sellers/invite-member-modal.tsx`, `src/hooks/use-team.ts`, `src/services/team.service.ts`: reusar como estão. O teto de usuários e o envio do e-mail já moram aí.
- `src/services/resolve-assignees.service.ts`: não incluir convites pendentes no casamento de responsáveis. Isso seria mudança de comportamento das 3 telas de importação.
- `src/pages/aceitar-convite.tsx` e a trilha do membro: fora desta onda.
- `src/pages/dashboard.tsx`: sem checklist nesta onda.

## Ordem de implementação
1. `types/database.ts`: os tipos de que todo o resto depende.
2. `lib/onboarding.ts` e `lib/onboarding.test.ts`. Rodar `npm run test:run -- src/lib/onboarding.test.ts` antes de seguir.
3. `hooks/use-whatsapp-numbers.ts`: opções novas. Rodar `npx tsc -b` para provar que quem chama sem argumento segue compilando.
4. `services/onboarding.service.ts` → `hooks/use-mark-onboarding.ts` → `hooks/use-onboarding-status.ts` → `hooks/use-first-inbound-lead.ts`.
5. `components/onboarding/whatsapp-test-panel.tsx` → `step-*.tsx` (welcome, whatsapp, team, import, done) → `onboarding-wizard.tsx` → `pages/onboarding.tsx`.
6. `components/onboarding/onboarding-gate.tsx` e `App.tsx`. O gate entra por último, para que durante o desenvolvimento ninguém seja redirecionado a uma página que ainda não existe.
7. `components/admin/setup-pending-banner.tsx` e `pages/admin.tsx`.

## Critérios de pronto

**Estáticos (as quatro evidências do PVO):**
- [ ] `npx tsc -b` verde (não `--noEmit`, que não checa nada neste tsconfig)
- [ ] `npm run build` verde
- [ ] `npm run lint` sem erro novo em relação ao merge-base
- [ ] `npm run test:run -- src/lib/onboarding.test.ts` com todos os casos passando
- [ ] `git diff --stat` mostra só os arquivos listados nesta Spec
- [ ] `grep -rn "—" src/components/onboarding src/components/admin/setup-pending-banner.tsx` sem resultado (sem em dash)

**No browser, staging (preview da branch):**
- [ ] Admin de empresa nova (criada via `provision-company` depois do corte, sem número): o login cai em `/onboarding`, tela 1 de 5, sem sidebar.
- [ ] Tela 2 lista os canais liberados para a empresa. Conectar um número por QR (WAHA ou Evolution) habilita `Continuar` em até ~5s, sem recarregar a página.
- [ ] Tela 2, teste: com o número conectado, o painel `Faça um teste` aparece. Mandar "oi" de outro celular faz o painel virar `Chegou!`, com nome e telefone, em até ~10s. O lead aparece no Inbox.
- [ ] Tela 2, teste ignorado: `Continuar` funciona sem mandar mensagem nenhuma.
- [ ] Tela 3 (equipe): `Convidar pessoa` abre o modal. Convidar um e-mail faz ele aparecer na lista de pendentes e chegar na caixa de entrada. O botão do rodapé vira `Continuar`.
- [ ] Tela 3 (equipe): numa empresa com `max_users` já atingido, o convite mostra o erro de limite e não aparece na lista.
- [ ] Tela 3 (equipe): `Pular esta etapa` avança sem gravar nada em `metadata`.
- [ ] Tela 4 (importar): com convite pendente, a linha sobre "Responsável" aparece. Sem convite, não aparece.
- [ ] Tela 4 (importar): `Pular esta etapa` avança para "Pronto" sem gravar nada em `metadata`.
- [ ] Tela 4 (importar): baixar a planilha modelo .xlsx, preencher 3 linhas com telefones distintos (pelo menos uma com valor de negócio e etapa diferente de "Novo Lead") e importar. O resultado mostra 3 importados. Fechar o modal troca o botão para `Continuar`.
- [ ] Depois de concluir o wizard, os 3 contatos aparecem em Contatos, e os 3 negócios aparecem no Pipeline na etapa mapeada, com o valor da planilha. Conferir o negócio de verdade, não só o contato (a criação de deals é best-effort).
- [ ] Contato importado com o número já conectado tem `whatsapp_instance_name` preenchido (SELECT rodado pela Leticia).
- [ ] Tela 5 → `Ir para o Pipeline` leva a `/pipeline`. Recarregar a página não volta ao wizard. No banco, `companies.metadata->'onboarding'->>'completed_at'` está preenchido (SELECT rodado pela Leticia).
- [ ] Nova empresa, `Fazer depois` na tela 1 → cai no dashboard. Logout e login não voltam ao wizard. `/admin` mostra o aviso `Termine de configurar`, e `Conectar agora` abre o seletor de conexão.
- [ ] Depois de conectar um número, o aviso some de `/admin`.
- [ ] Empresa **antiga** sem número: o login vai direto ao dashboard (sem wizard), e `/admin` mostra o aviso.
- [ ] Empresa antiga **com** número conectado: nem wizard nem aviso.
- [ ] Seller da empresa nova: nunca é redirecionado. Acessar `/onboarding` à mão leva a `/acesso-negado`.
- [ ] Super admin impersonando a empresa nova: sem redirecionamento.
- [ ] Mobile (aparelho real ou 375px): wizard sem scroll horizontal, botões do rodapé visíveis.

## Achados fora de escopo (reportar, não corrigir)
- `interface Company` declara `settings: Record<string, unknown>`, mas `public.companies` não tem essa coluna no Central. Quem lê `company.settings` recebe `undefined`. Vale um grep e uma Spec própria.
- `whatsapp-connect-dialog.tsx` (Evolution) e `use-cloud-api-onboard.ts` não invalidam `['whatsapp-numbers']`, então a lista de Integrações fica até 30s sem mostrar o número recém-conectado. Contornado aqui com polling. A correção na origem é outra Spec.
- `createDealsForImportedLeads` (`import-leads.service.ts`, linha ~206) é best-effort. Se o insert em `deals` falhar, o erro só vai para o `console.error`, e o modal informa os contatos como importados sem negócio. Hoje isso já vale em Contatos e Negócios, e a pessoa não fica sabendo. Vale uma Spec própria para levar a falha até a tela de resultado.
- O casamento da coluna "Responsável" do import ignora convites pendentes. No onboarding, o admin convida a equipe e importa logo em seguida, e a maioria dos convidados ainda não aceitou. Contornado aqui só com um aviso. Uma Spec futura pode deixar atribuir a convidado pendente e resolver no aceite.
