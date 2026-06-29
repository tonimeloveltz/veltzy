# Spec - Onda 1 (lado Veltzy): leitura da allowlist + tela de escolha de categoria

**PRD:** `docs/features/conexao-whatsapp-cliente/PRD.md` (secao 8, Onda 1).
**Escopo:** Veltzy apenas. O lado Hub (toggles que escrevem `companies.whatsapp_categories`) ja esta mergeado em develop no repo do Hub.
**Esta Spec cobre:** a LEITURA da allowlist (read-only) e a tela client-facing de escolha de categoria de conexao.
**Status:** Spec pronta. Nao implementar nesta etapa.

---

## 1. Resumo

O cliente final (admin da empresa) precisa de uma tela para conectar o WhatsApp escolhendo entre duas categorias de produto com labels neutros. A tela renderiza somente as categorias que o Hub liberou para a empresa, lendo a coluna `public.companies.whatsapp_categories` (read-only via RLS). A bifurcacao:

- `qr_code` selecionada: abre o fluxo de QR Code JA existente (`WhatsAppConnectDialog`), sem recriar nada.
- `official` selecionada: placeholder desabilitado com aviso interno "em configuracao". O Embedded Signup real e a Onda 2.

O Veltzy NUNCA escreve `whatsapp_categories`.

---

## 2. Regra critica de App Review (a mais importante desta Spec)

Esta e tela client-facing. O cliente final ve. No video do App Review da Meta NAO pode aparecer nenhuma mencao a provider nao oficial.

- Os labels das categorias sao constante unica no codigo, com texto neutro de produto, e NUNCA contem nome de provider:
  - categoria `official` -> label "WhatsApp API Oficial"
  - categoria `qr_code` -> label "Conexao via QR Code"
- As strings "Evolution", "Z-API", "Cloud API", "Meta" NAO aparecem em lugar nenhum desta tela nem em nenhum componente que ela renderiza. "Cloud API" e nome de motor interno, fica fora.
- Excecao conhecida: o fluxo de QR Code reusado (`WhatsAppInstances` / `WhatsAppConnectDialog`) hoje exibe o titulo "WhatsApp (Evolution API)" no card interno (`whatsapp-instances.tsx:60`). Como esse componente passa a ser renderizado a partir da nova tela client-facing, ele precisa ser neutralizado nesta Onda. Ver secao 6.

### Assercao testavel de App Review

Apos implementar, este grep deve retornar ZERO ocorrencia nos componentes da tela de escolha e em tudo que ela renderiza:

```bash
grep -rniE "evolution|z-?api|cloud[ _-]?api|\bmeta\b" \
  src/components/admin/whatsapp-connect-choice.tsx \
  src/components/admin/whatsapp-instances.tsx \
  src/components/admin/whatsapp-connect-dialog.tsx \
  src/lib/whatsapp-categories.ts
```

Esperado: nenhuma linha. Se aparecer, corrigir antes de fechar a Onda. Esta assercao entra no plano de teste manual (secao 8) e deve ser rodada antes de qualquer gravacao de video.

---

## 3. Contrato de dados (somente leitura)

- **Origem do dado:** `public.companies.whatsapp_categories jsonb NOT NULL DEFAULT '{"official": true, "qr_code": true}'`. Coluna JA existe e ja e escrita pelo Hub (Onda 0 + toggles do Hub, mergeados). Esta Spec NAO altera schema, NAO gera DDL.
- **Shape:** `{ "official": boolean, "qr_code": boolean }`. Duas chaves fixas, booleanas.
- **Como o Veltzy le:** Supabase client direto, RLS ja garante que a empresa so le a propria linha (`company_id = get_current_company_id() OR is_super_admin()`). Sem edge function: e leitura simples de coluna.
- **Defensivo (null/ausente):** se `whatsapp_categories` vier `null`, ou se uma das chaves vier ausente, tratar como **ON** (coerente com o default do Hub: ninguem deve ser bloqueado por dado faltante). Normalizar para `{ official: true, qr_code: true }` quando null; por chave, `value ?? true`.
- **Direcao do contrato:** Hub escreve (painel super_admin), Veltzy le (RLS). Sem nova superficie de API. Ver PRD secao 7.

---

## 4. Constante de labels neutros (isolada e reutilizavel)

Novo arquivo: `src/lib/whatsapp-categories.ts`.

Conteudo (referencia, ajustar a convencao do repo):

```ts
export type WhatsAppCategoryKey = 'official' | 'qr_code'

export interface WhatsAppCategoryMeta {
  key: WhatsAppCategoryKey
  label: string
  description: string
  available: boolean // false = placeholder "em configuracao" (Onda 2)
}

// Labels neutros de produto. NUNCA citar provider real aqui.
export const WHATSAPP_CATEGORIES: Record<WhatsAppCategoryKey, WhatsAppCategoryMeta> = {
  official: {
    key: 'official',
    label: 'WhatsApp API Oficial',
    description: 'Conexao oficial para o numero da sua empresa.',
    available: false, // Onda 1: placeholder. Onda 2 liga o Embedded Signup.
  },
  qr_code: {
    key: 'qr_code',
    label: 'Conexao via QR Code',
    description: 'Conecte um numero escaneando um QR Code.',
    available: true,
  },
}

export const WHATSAPP_CATEGORY_ORDER: WhatsAppCategoryKey[] = ['official', 'qr_code']
```

Regras:
- `label` e `description` sao copy de produto, sem nome de provider.
- `available` controla o placeholder: `official` fica `false` na Onda 1 (a tela mostra o card desabilitado com aviso "em configuracao"). A Onda 2 troca para `true` e liga o fluxo real.
- Mantida em `src/lib/` para ser reutilizavel por Onda 2 e Onda 3.

---

## 5. Camada de dados: tipo + service + hook

### 5.1 Tipo

Editar `src/types/database.ts`:
- Adicionar `whatsapp_categories` ao `interface Company` (campo `whatsapp_categories: WhatsAppCategories | null`).
- Definir o tipo de apoio:

```ts
export interface WhatsAppCategories {
  official: boolean
  qr_code: boolean
}
```

### 5.2 Service (leitura pura)

Novo arquivo: `src/services/whatsapp-categories.service.ts` (segue o padrao de `whatsapp.service.ts`: funcao pura, recebe `companyId`, usa o supabase client, sem hook, sem UI).

```ts
import { supabase } from '@/lib/supabase'
import type { WhatsAppCategories } from '@/types/database'

const DEFAULT_CATEGORIES: WhatsAppCategories = { official: true, qr_code: true }

export const getWhatsAppCategories = async (companyId: string): Promise<WhatsAppCategories> => {
  const { data, error } = await supabase
    .from('companies')
    .select('whatsapp_categories')
    .eq('id', companyId)
    .single()
  if (error) throw error

  const raw = (data?.whatsapp_categories ?? null) as Partial<WhatsAppCategories> | null
  // Defensivo: null ou chave ausente -> ON (coerente com o default do Hub).
  return {
    official: raw?.official ?? DEFAULT_CATEGORIES.official,
    qr_code: raw?.qr_code ?? DEFAULT_CATEGORIES.qr_code,
  }
}
```

### 5.3 Hook React Query

Novo arquivo: `src/hooks/use-whatsapp-categories.ts` (segue o padrao de `use-whatsapp-status.ts`: `useQuery`, `companyId` do `useAuthStore`, `enabled: !!companyId`).

```ts
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { getWhatsAppCategories } from '@/services/whatsapp-categories.service'

export const useWhatsAppCategories = () => {
  const companyId = useAuthStore((s) => s.company?.id)
  return useQuery({
    queryKey: ['whatsapp-categories', companyId],
    queryFn: () => getWhatsAppCategories(companyId!),
    enabled: !!companyId,
    staleTime: 60_000,
  })
}
```

Nota: o hook nunca expoe escrita. Nao ha mutation nesta Onda.

---

## 6. Tela de escolha de categoria

### 6.1 Ponto de entrada na navegacao (lido no codigo, nao inventado)

A area de integracoes do cliente vive em `src/components/admin/integrations-tab.tsx`, aba "Canais" (`TabsContent value="channels"`). Hoje o componente `WhatsAppCard()` (`integrations-tab.tsx:67`) bifurca por provider via `useWhatsAppStatus()`:

- `evolution` -> renderiza `<WhatsAppInstances />`
- `cloud_api` / `zapi` -> renderiza `<HubManagedCard />`

**Mudanca:** `WhatsAppCard()` passa a renderizar a nova tela de escolha `<WhatsAppConnectChoice />` no lugar da bifurcacao por provider. A logica de qual fluxo abrir deixa de ser "qual provider esta ativo" e passa a ser "quais categorias a allowlist liberou". O `HubManagedCard` continua existindo como fallback (ver 6.3) e tambem segue em uso pelos outros canais (Instagram, Email, Calendar) sem alteracao.

### 6.2 Novo componente

Novo arquivo: `src/components/admin/whatsapp-connect-choice.tsx`.

Responsabilidades:
- Le a allowlist via `useWhatsAppCategories()`.
- Enquanto carrega, exibe `Skeleton` (padrao do repo).
- Calcula as categorias visiveis: `WHATSAPP_CATEGORY_ORDER.filter(key => categories[key] === true)`.
- Renderiza um card por categoria visivel, usando label/description de `WHATSAPP_CATEGORIES` (constante da secao 4).
- Gating de acao por role: o botao de conectar segue o padrao atual (`useRoles().isAdmin`), igual ao `WhatsAppInstances`. Sem alterar regras de permissao.

Comportamento por contagem de categorias ON:

- **As 2 ON:** mostra os 2 cards (oficial primeiro, conforme `WHATSAPP_CATEGORY_ORDER`).
- **Somente 1 ON:** mostra so ela.
  - **Decisao de UX (documentada):** NAO pular automaticamente para o fluxo unico. Mostrar o card unico da categoria ON e exigir um clique para iniciar. Motivo: (a) o fluxo de QR Code abre um dialog modal, abrir modal sem acao do usuario e ruim de UX e confunde com erro; (b) a categoria oficial e placeholder na Onda 1, "pular direto" nao se aplica a ela. Pular automaticamente fica como possivel refinamento de Onda 2/3, fora desta Spec.
- **Nenhuma ON:** estado vazio com mensagem neutra. Texto: "Nenhum metodo de conexao disponivel. Fale com o suporte." NAO expor que existe um Hub nem que ha categorias desligadas em algum painel.

### 6.3 Bifurcacao

- Card `qr_code` (sempre `available: true`): ao clicar em conectar, abre o fluxo de QR Code JA existente. Opcoes de implementacao, escolher a de menor superficie:
  - **Preferida:** renderizar `<WhatsAppInstances />` (que ja contem a lista + o `WhatsAppConnectDialog` em `mode="create"`) quando a categoria QR Code e selecionada/expandida.
  - Alternativa: abrir o `WhatsAppConnectDialog` (`props: open, onOpenChange, mode='create'`) diretamente a partir do card.
  - Em ambos os casos, NAO recriar maquina de estados, polling, nem timeout de QR. Reuso puro.
- Card `official` (na Onda 1 `available: false`): renderiza desabilitado com badge/aviso interno "em configuracao". Sem acao ao clicar (ou clique abre toast/aviso "em breve"). O Embedded Signup real e a Onda 2.

### 6.4 Neutralizacao do fluxo QR reusado (App Review)

Como `WhatsAppInstances` / `WhatsAppConnectDialog` passam a ser client-facing a partir desta tela, remover qualquer mencao a provider neles:

- `src/components/admin/whatsapp-instances.tsx:60`: titulo "WhatsApp (Evolution API)" -> usar o label neutro "Conexao via QR Code" (ou "WhatsApp"), vindo da constante de labels.
- Varrer `whatsapp-connect-dialog.tsx` por qualquer string de provider visivel ao usuario e neutralizar.
- A varredura final e a assercao de grep da secao 2.

---

## 7. Arquivos a criar / editar (caminho exato)

**Criar:**
- `src/lib/whatsapp-categories.ts` (constante de labels neutros + tipos de apoio do menu).
- `src/services/whatsapp-categories.service.ts` (leitura pura da allowlist, defensiva contra null).
- `src/hooks/use-whatsapp-categories.ts` (hook React Query, read-only).
- `src/components/admin/whatsapp-connect-choice.tsx` (tela de escolha client-facing).

**Editar:**
- `src/types/database.ts` (add `whatsapp_categories` ao `interface Company` + `interface WhatsAppCategories`).
- `src/components/admin/integrations-tab.tsx` (`WhatsAppCard` passa a renderizar `<WhatsAppConnectChoice />`; manter `HubManagedCard` para os demais canais).
- `src/components/admin/whatsapp-instances.tsx` (neutralizar titulo "WhatsApp (Evolution API)").
- `src/components/admin/whatsapp-connect-dialog.tsx` (neutralizar eventuais strings de provider visiveis).

**Fora de escopo desta Onda (nao tocar):** `process-message-queue`, qualquer codigo de inbound, `whatsapp-send`, providers em `_shared/`, schema/migrations. Onda 1 e somente leitura + UI no front.

---

## 8. Plano de teste manual

Pre-condicao: empresa de teste logada como admin; super_admin com acesso ao painel do Hub para mexer nos toggles.

1. **Empresa com as 2 categorias ON:** abrir Configuracoes -> Integracoes -> Canais. Esperado: 2 cards ("WhatsApp API Oficial" desabilitado/"em configuracao" e "Conexao via QR Code" ativo).
2. **Conectar via QR Code:** clicar em conectar no card QR Code; o dialog/maquina de estados existente abre e conecta um numero normalmente (reuso, sem regressao).
3. **Admin desliga uma categoria no Hub:** no painel do Hub, desligar "QR Code" para a empresa; cliente recarrega a tela. Esperado: some o card de QR Code, sobra so "WhatsApp API Oficial".
4. **Empresa com 0 ON:** desligar as 2 no Hub; cliente recarrega. Esperado: estado vazio com "Nenhum metodo de conexao disponivel. Fale com o suporte." Sem mencao a Hub.
5. **Defensivo null:** empresa cuja `whatsapp_categories` esteja `null` (caso legado). Esperado: ambas tratadas como ON (2 cards). Validar sem alterar o dado.
6. **Cenario App Review:** empresa de gravacao com apenas `official` ON. Esperado: somente o card oficial; nenhuma mencao a provider nao oficial em tela.
7. **Assercao de App Review (grep):** rodar o grep da secao 2. Esperado: zero ocorrencia.
8. **Build limpo:** `npm run build` (tsc + vite) sem erros.

---

## 9. Notas de contrato e fora de escopo

- **Contrato:** o dado vem do Hub (escrito na Spec/Onda anterior do Hub, ja mergeada). Aqui o Veltzy so le. Nenhuma escrita de `whatsapp_categories` no Veltzy.
- **Sem schema:** a coluna ja existe; esta Spec nao gera DDL nem migration.
- **Categoria oficial e placeholder nesta Onda.** O Embedded Signup (SDK Meta, onboarding edge, troca de token) e a Onda 2.
- **Multi-numero** (filtro por numero, SDR por numero, escolha pelo vendedor) e a Onda 3, fora daqui.
- **Decisao herdada do PRD (secao 8, Onda 2):** token global temporario vs token por WABA. Nao afeta a Onda 1; registrada para a Onda 2.
