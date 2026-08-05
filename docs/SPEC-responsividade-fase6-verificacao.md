# Spec - Responsividade Mobile, Fase 6 (telas publicas e varredura final)

**Branch:** `feature/responsividade-mobile-verificacao`
**Base:** `develop` em `6f29638` (merge do PR #147, Fase 5B)
**Escopo:** as rotas publicas (fora do `MainLayout`) e a varredura final dos criterios de aceite.
**PRD de origem:** `docs/PRD-responsividade.md`, secao 4 Fase 6 itens 16 e 17, e secao 6 (os 19 criterios).

---

## 0. Resumo executivo

**Esta fase e diferente de todas as anteriores: ela nao foi desenhada a partir de um defeito, e sim a partir de uma lista de verificacao.** Isso inverte o onus. Nas Fases 2 a 5B a pergunta era "como consertar isto"; aqui e "isto esta quebrado?", e a resposta honesta na maioria dos casos e **nao**.

Resultado da investigacao previa, antes de qualquer edicao:

| Frente | Veredito | Base |
|---|---|---|
| Item 16 - layout das telas publicas em 360px | **VERDE, sem acao** | secao 3: todas sao cartao unico centralizado, coluna unica, sem largura fixa |
| Item 16 - altura das telas publicas | **VERMELHO, 17 linhas** | secao 4.1: a familia `100vh` que a Fase 5B corrigiu em um arquivo so |
| Item 17 - criterio 12 (tabelas) | **VERDE, confirmado por grep** | secao 5.2: as 8 tabelas tem `overflow-x-auto` |
| Item 17 - criterio 10 (grids) | **1 quebra medida, 2 falsos positivos** | secao 4.2 e 5.3 |
| Item 17 - criterio 18 (cores) | **JA FALHA, e nunca foi alcancavel** | secao 5.4: 276 ocorrencias em 49 arquivos |

**Total: 3 arquivos de codigo com mudanca prescrita, 0 arquivos novos** (mais 6 arquivos que recebem so a troca `vh` para `dvh`, listados em 4.1). Nenhuma mudanca de logica, formulario, validacao ou fluxo de autenticacao.

**O achado que mais importa nao e de codigo, e de metodo:** dos 19 criterios de aceite do PRD, **9 sao verificaveis por grep e 10 exigem olho humano**. A secao 5 separa os dois e transforma os 9 em comandos reproduziveis. Isso responde a um problema recorrente desta frente, registrado em `docs/audits/responsividade-fase3-item10-2026-08-03.md`: verificacao que nao deixa rastro reproduzivel vira afirmacao sem medida.

---

## 1. Metodo de medicao

Mesma metodologia das Fases 3, 4, 5A e 5B. Medias de glifo: `text-sm` (14px) = **7,3px/char**, `text-xs` (12px) = **6,2px**, `text-[15px]` = **7,8px**. Margem de erro **±10%**. Acima de 20% e quebra confirmada; entre 10 e 20% e quebra com folga registrada; abaixo de 10% e risco marginal, **que esta Spec nao declara seguro nem quebrado**.

**As telas publicas nao passam pelo `MainLayout`.** Nao ha sidebar, nao ha `MobileTopbar`, nao ha padding de pagina das 11 rotas. A largura util e a viewport cheia menos o padding proprio da tela.

### 1.1 Largura util, telas de cartao (`/auth`, `/auth/cadastro`, `/aceitar-convite`, `/acesso-negado`, `/update-password`)

Padrao comum: `<div class="p-4"><div class="w-full max-w-md">`, com `Card > CardContent` de `p-6`.

| Viewport | menos `p-4` | cartao efetivo | dentro do `CardContent` |
|---|---|---|---|
| 360px | 328px | **328px** (`max-w-md` = 448px nao alcanca) | **280px** |
| 390px | 358px | 358px | 310px |
| 414px | 382px | 382px | 334px |
| 640px (`sm`) | 608px | 448px (aqui o `max-w-md` passa a morder) | 400px |

**A leitura decisiva:** abaixo de 448px o `max-w-md` e inerte e quem manda e o `w-full`. Por isso essas telas sao fluidas por construcao, e nao por acidente.

### 1.2 Largura util, telas legais (`/termos`, `/privacidade`)

`<main class="mx-auto max-w-[720px] px-5">` em `legal-document-page.tsx:107`.

| Viewport | util | dentro de `<ul>`/`<ol>` (`pl-6`) |
|---|---|---|
| 360px | **320px** | **296px** |
| 390px | 350px | 326px |
| 720px+ | 680px, travado | 656px |

---

## 2. Inventario real das rotas publicas

**O PRD esta desatualizado neste ponto e a Spec corrige.** A secao 4 Fase 6 item 16 nomeia quatro telas: `/auth`, `/aceitar-convite`, `/termos`, `/privacidade`. Hoje sao **sete rotas publicas**, mais o 404 e mais duas telas de shell compartilhado.

| # | Rota | Arquivo | Estava no PRD? |
|---|---|---|---|
| 1 | `/auth` | `src/pages/auth.tsx` | sim |
| 2 | `/auth/cadastro` | `src/pages/auth-cadastro.tsx` | **nao** |
| 3 | `/aceitar-convite` | `src/pages/aceitar-convite.tsx` | sim |
| 4 | `/acesso-negado` | `src/pages/acesso-negado.tsx` | **nao** |
| 5 | `/privacidade` e `/privacy` | `src/pages/privacidade.tsx` | sim |
| 6 | `/termos` e `/terms` | `src/pages/termos.tsx` | sim |
| 7 | `/update-password` | `src/pages/update-password.tsx` | **nao** (esta atras de `ProtectedRoute skipCompanyCheck`, mas se alcanca deslogado por link de email) |
| 8 | rota `*` (404) | `src/pages/not-found.tsx` | **nao** |
| 9 | estado de loading do guard | `src/components/auth/protected-route.tsx` | **nao**, e nao e rota |
| 10 | fallback do `Suspense` | `src/components/shared/page-loading-skeleton.tsx` | **nao**, e nao e rota |

**Decisao: a fase cobre as 10.** Uma varredura final que pula `/auth/cadastro` porque a lista do PRD foi escrita antes dela nao e varredura, e a lista foi escrita antes. Os itens 9 e 10 entram porque compartilham exatamente o defeito da secao 4.1 e sao as primeiras coisas que qualquer usuario ve em qualquer rota.

---

## 3. Estado atual medido: por que o item 16 e quase todo verde

**Nenhuma tela publica tem grid, tabela, largura fixa em pixel, ou toolbar.** Todas seguem a mesma forma: cartao centralizado, `space-y-4`, `Label` acima de `Input`, botao `w-full`. Essa forma nao tem como estourar em 360px, e nao estoura.

Medicoes dos unicos pontos onde ha mais de um elemento na mesma linha:

| Onde | Conteudo | Pedido | Disponivel | Veredito |
|---|---|---|---|---|
| `auth.tsx:124` | rodape "Politica de Privacidade · Termos de Servico", `text-xs`, `gap-3` | 142,6 + 6 + 105,4 + 24 = **278px** | 328px | cabe, folga 15% - **SEM ACAO** |
| `acesso-negado.tsx:20` | "Voltar" + "Ir para o Painel", `gap-3` | 75,8 + 148,8 + 12 = **236,6px** | 280px | cabe, folga 15,4% - **SEM ACAO** |
| `aceitar-convite.tsx:460` | "Cancelar" + "Aceitar convite", `gap-3`, estado ocioso | 90,4 + 141,5 + 12 = **243,9px** | 280px | cabe, folga 13% |
| `aceitar-convite.tsx:460` | idem, **estado `accepting`** (entra o `Loader2 mr-2 h-4 w-4` = +24px) | **267,9px** | 280px | **folga 4,3%, dentro da margem de erro** - ver 4.3 |
| `login-form.tsx:71` | `Label` "Senha" + botao "Esqueceu a senha?" com `justify-between` | 36,5 + 105,4 = **141,9px** | 280px | cabe, folga 49% - **SEM ACAO** |
| `politica-privacidade.md:91` | URL nua de 45 chars autolinkada, dentro de `<ul pl-6>` | 351px so a URL | 296px | **estouraria em 18,6%, mas ja esta protegida** - ver 3.1 |

### 3.1 O link longo ja esta protegido, e por um caminho nao obvio

`docs/legal/politica-privacidade.md:91` e `:92` trazem duas URLs nuas dentro de itens de lista. O `remark-gfm` as transforma em autolink; o `href` resultante casa com a regex `isExternal` de `legal-document-page.tsx:17`; e **so o ramo externo do `MarkdownLink` carrega `break-words`** (`:26`). O ramo interno de `:34` nao carrega.

**Resultado: cabe hoje, por dependencia de tres passos que ninguem escreveu de proposito junto.** Fica registrado como pendencia 4 da secao 8, nao como acao: qualquer URL longa que passe a ser escrita em markdown como link nomeado interno perde a protecao.

---

## 4. As mudancas

### 4.1 A familia `100vh` (17 linhas, 9 arquivos)

**Este e o unico defeito de verdade do item 16, e ele nao e novo: e o mesmo D2 da Fase 5B.**

A Fase 5B mediu, e a usuaria confirmou em aparelho real, que `h-screen` em mobile e a altura com a barra de endereco **retraida**, entao o rodape fica atras do chrome do navegador. A 5B corrigiu **um** arquivo: `main-layout.tsx:14`, hoje `h-dvh`. As telas publicas nao passam pelo `MainLayout` e ficaram todas com `100vh`.

**Nota de honestidade, e ela importa:** o mecanismo foi confirmado em aparelho real na 5B, no `/pipeline`. **O sintoma nao foi observado individualmente em nenhuma das 17 linhas abaixo.** O que esta Spec afirma e que elas compartilham o mecanismo, nao que cada uma foi vista quebrada. O item 12 da secao 9.2 e o que fecha isso.

**Grupo A1 - `min-h-screen` para `min-h-dvh` (7 linhas, 6 arquivos).** Aqui o `100vh` e um **minimo**, entao a pagina cresce e o conteudo nunca fica inalcancavel. O sintoma e outro: com conteudo curto, o documento tem 100vh mas a area visivel tem menos, entao **a pagina rola sem ter o que mostrar**, e o `items-center` centraliza dentro da caixa alta, deixando o cartao abaixo do centro optico.

| Arquivo | Linha |
|---|---|
| `src/pages/auth.tsx` | `:62` |
| `src/pages/auth-cadastro.tsx` | `:23` |
| `src/pages/aceitar-convite.tsx` | `:500`, `:545` |
| `src/pages/update-password.tsx` | `:52` |
| `src/pages/not-found.tsx` | `:6` |
| `src/components/legal/legal-document-page.tsx` | `:90` |

**Grupo A2 - `h-screen` para `h-dvh` (10 linhas, 6 arquivos).** Aqui a altura e **travada**, que e a forma severa: se o conteudo passar de 100vh com `items-center`, ele estoura para os dois lados e o topo fica inalcancavel, porque scroll de documento nao alcanca deslocamento negativo.

| Arquivo | Linha | Conteudo |
|---|---|---|
| `src/pages/auth.tsx` | `:36` | spinner |
| `src/pages/auth-cadastro.tsx` | `:12` | spinner |
| `src/pages/aceitar-convite.tsx` | `:395` | spinner |
| `src/pages/aceitar-convite.tsx` | `:403`, `:428`, `:452` | **cartao com icone, titulo, descricao e botoes** |
| `src/pages/acesso-negado.tsx` | `:10` | **cartao com icone, titulo, descricao e botoes** |
| `src/components/auth/protected-route.tsx` | `:23`, `:39` | spinner |
| `src/components/shared/page-loading-skeleton.tsx` | `:5` | spinner |

Nos seis casos de spinner o conteudo tem 32px e nunca estoura: o ganho e so a centralizacao correta. **Nao inflar isso em "correcao de bug".** Nos quatro casos de cartao o conteudo tem cerca de 300px, que cabe em 640px de altura, mas **nao cabe em retrato curto nem em paisagem**, e ai o `dvh` deixa de ser cosmetico.

**Grupo A3 - NAO TOCAR.** `src/components/layout/app-sidebar.tsx:254`, `'hidden lg:flex h-screen w-64 ...'`. E `lg:` para cima, onde a altura da viewport e estavel, e **a secao 8.2 da Spec da 5B ja registrou explicitamente que esta linha esta correta**. Ela tambem esta na lista de nao-tocar do shell da Fase 1. Se ela aparecer no diff, a fase falhou o item 4 da secao 9.1.

### 4.2 `edit-lead-modal.tsx:215` - a unica quebra medida do item 17

**Este item reabre uma pergunta que a Fase 5B deixou aberta de proposito, e a resposta e que a correcao dela nao funciona.**

A 5B, item 4.6, trocou `grid w-full grid-cols-3` por `grid w-full grid-cols-3 h-auto` (commit `7b9c243`). O item 14 da verificacao dela dizia: *"O `TabsList` do `edit-lead-modal` nao estoura. Se nunca estourava, reverter 4.6 e fechar a pendencia como inerte"*. A verificacao nao chegou a isolar esse item.

**A medicao diz que estoura, e que o `h-auto` e inerte contra esse estouro.**

Cadeia de largura em 360px:
- `DialogContent className="sm:max-w-lg"` em `:206`. Abaixo de `sm` o `sm:max-w-lg` nao vale, entao manda a base de `dialog.tsx:36`: `max-w-[calc(100vw-2rem)]` = **328px**.
- `p-6` do `DialogContent` = **280px**.
- `TabsList` traz `p-1` do shadcn = **272px** para a grade.
- `grid-cols-3` em Tailwind e `repeat(3, minmax(0, 1fr))`, entao cada trilha tem **90,67px** fixos.

Cada `TabsTrigger` traz `px-3` (24px) e `text-sm` de `tabs.tsx:29`:

| Aba | chars | pedido | trilha | veredito |
|---|---|---|---|---|
| **Informacoes** | 11 | 80,3 + 24 = **104,3px** | 90,67px | **15,0% acima - quebra com folga registrada** |
| Historico | 9 | 65,7 + 24 = 89,7px | 90,67px | cabe por 1% |
| Tarefas | 7 | 51,1 + 24 = 75,1px | 90,67px | cabe |

**Por que o `h-auto` nao resolve:** `tabs.tsx:29` carrega `whitespace-nowrap`, e "Informacoes" e uma palavra unica sem espaco. Nao ha onde quebrar, entao nao ha segunda linha para o `h-auto` acomodar. Ele libera uma altura que nunca e pedida.

**Por que nao gera scroll horizontal na pagina:** o `minmax(0, 1fr)` do Tailwind mata o `min-width: auto` do item de grade, entao a trilha nao alarga. O texto **transborda a celula por cima da vizinha**. O sintoma e sobreposicao e corte, nao rolagem.

**Correcao prescrita:** reduzir o pedido abaixo de `sm`, nas tres `TabsTrigger` de `:216`, `:217` e `:218`:

```
className="px-2 text-xs sm:px-3 sm:text-sm"
```

Nova medida da aba mais larga: 11 × 6,2 + 16 = **84,2px** contra 90,67px, **folga de 7,1%**. As outras duas encolhem junto e continuam cabendo.

**Tres restricoes sobre como aplicar:**
1. **Nao editar `src/components/ui/tabs.tsx`.** E arquivo global da Fase 2 e atinge todo `Tabs` do produto. A classe vai nas tres instancias.
2. O `cn()` de `tabs.tsx:29` usa `tailwind-merge`, entao `px-2` e `text-xs` vencem `px-3` e `text-sm` da base de forma deterministica. **Nao precisa de `!important` nem de variante arbitraria.**
3. **O `h-auto` de `:215` fica.** Ele nao resolve o estouro, mas tambem nao atrapalha e passa a ser util se o texto de alguma aba mudar. Removê-lo seria mexer no diff da 5B sem ganho.

### 4.3 `aceitar-convite.tsx:460` - o unico marginal

Pela tabela da secao 3: no estado ocioso sobra 13%, no estado `accepting` sobra **4,3%**, abaixo da margem de erro de ±10% do proprio metodo. **Esta Spec nao afirma que estoura. Afirma que nao e possivel declarar seguro.**

Prescricao, na linha `:460`:

```
CardContent className="flex flex-wrap justify-center gap-3"
```

`flex-wrap` e **inerte quando o conteudo cabe**: so age se houver transbordo. Se a medicao estiver certa e sobrarem 4,3%, nada muda visualmente; se estiver errada dentro da margem, os botoes empilham em vez de estourar. E o mesmo argumento das Fases 3 e 4.

**`acesso-negado.tsx:20` NAO recebe `flex-wrap`.** Tem 15,4% de folga, acima da margem, e portanto e declaravel seguro. Aplicar ali seria consertar por reflexo o que a medicao diz que esta bom, e esta fase existe justamente para nao fazer isso.

---

## 5. A varredura do item 17

O PRD pede "varredura final nos viewports alvo" e lista 19 criterios de aceite na secao 6. **Nove deles nao precisam de viewport nenhum: sao verificaveis por grep, de forma reproduzivel e falsificavel.** Os outros dez exigem olho humano e vao para a secao 9.2.

Esta separacao e o principal entregavel de metodo da fase. Os comandos abaixo devem ser **executados e ter a saida transcrita no relatorio**, nao parafraseados.

### 5.1 Os nove criterios grepaveis

| Criterio | Comando | Esperado |
|---|---|---|
| 10 (grids) | `grep -rnoE "(^\|[\"' ])grid-cols-[3-9]" src/ \| grep -vE "(sm\|md\|lg\|xl):grid-cols"` | 3 linhas, todas justificadas em 5.3 |
| 12 (tabelas) | ver 5.2 | 8 de 8 com `overflow-x-auto` |
| 18a (sem `any`) | `grep -rn ": any\|as any\|<any>" src/ \| wc -l` | **0** |
| 18b (cores) | ver 5.4 | linha de base registrada, **nao zerada** |
| 19 (supabase intocado) | `git diff --stat develop -- supabase/` | vazio |
| build | `npm run build` | sem erro |
| tipos | `npx tsc --noEmit` | exit 0 |
| lint | ver 9.1 | zero novos sobre o merge-base |
| testes | `npm run test:run` | sem regressao (existem `termos.test.tsx` e `privacidade.test.tsx`) |

### 5.2 Criterio 12: VERDE, e ja confirmado

Rodado na investigacao previa, sobre `develop` em `6f29638`. **As 8 tabelas do produto estao em container com `overflow-x-auto`, sem excecao.** O numero bate com o "8 tabelas" que o PRD afirmou na secao 6.

| Arquivo | Container | Tabela |
|---|---|---|
| `super-admin/companies-dashboard.tsx` | `:36` | `:37` |
| `pipeline/import-steps/preview-step.tsx` | `:79` | `:80` |
| `pipeline/import-steps/result-step.tsx` | `:57` | `:58` |
| `sdr-v2/dashboard/SdrV2Dashboard.tsx` | `:87` | `:88` |
| `admin/sellers-tab.tsx` | `:81` | `:82` |
| `dashboard/seller-performance-table.tsx` | `:39` | `:40` |
| `pages/deals.tsx` | `:338` | `:339` |
| `pages/contatos.tsx` | `:140` | `:141` |

**Nenhuma acao.** O trabalho da codificadora aqui e reproduzir o grep e confirmar que continua 8 de 8, nao mexer em nada.

### 5.3 Criterio 10: tres sobreviventes, e so um e quebra

O criterio diz "nenhum `grid-cols-3` ou `grid-cols-4` permanece ativo abaixo de 640px". Sobreviveram tres a Fase 2. **Dois sao falsos positivos e ficam como estao, com a medida registrada:**

| Onde | O que e | Medicao | Veredito |
|---|---|---|---|
| `edit-lead-modal.tsx:215` | `TabsList` de 3 abas | "Informacoes" pede 104,3px em trilha de 90,67px | **quebra, 15% - corrigido em 4.2** |
| `theme-customizer.tsx:187` | 3 botoes de tema | trilha de 85,3px; rotulo mais largo "Escuro" pede 6 × 7,3 + 32 (`p-4`) = **75,8px** | cabe, folga 11,1% - **SEM ACAO** |
| `color-picker.tsx:28` | paleta de amostras dentro de `PopoverContent w-auto p-2` | 4 × 24px + 3 × 6px de `gap-1.5` + 16px de `p-2` = **130px de largura total do popover** | **falso positivo estrutural - SEM ACAO** |

Sobre o `color-picker`: o popover e `w-auto`, entao ele **se dimensiona pelo conteudo** e nunca chega perto de 360px. O criterio 10 foi escrito pensando em grade de layout de pagina, e uma paleta de amostras de 24px num popover de 130px nao e isso. **Trocar por `grid-cols-2 sm:grid-cols-4` deixaria a paleta alta e estreita sem ganho nenhum.** Fica registrado como excecao permanente ao criterio, na pendencia 1.

### 5.4 Criterio 18: ja falha hoje, e nunca foi alcancavel nesta frente

O criterio 18 do PRD diz: *"Zero `any` introduzido; nenhuma cor hardcoded (so tokens semanticos), conforme CLAUDE.md"*.

Medicao em `develop` `6f29638`:

| Metade | Resultado |
|---|---|
| Zero `any` | **VERDE, 0 ocorrencias** |
| Nenhuma cor hardcoded | **276 ocorrencias em 49 arquivos** |

**As 276 sao anteriores a toda a frente de responsividade.** Exemplos nas telas desta fase: `aceitar-convite.tsx:475-479` (`bg-blue-100 text-blue-800 dark:bg-blue-900 ...` nos badges de papel) e `:431` (`text-green-500`).

**Leitura correta do criterio, e a Spec fixa esta:** a primeira metade e sobre estado absoluto e esta verde; a segunda so pode ser lida como **"nenhuma cor hardcoded introduzida"**, porque zerar 276 ocorrencias e refatoracao de design system, nao responsividade, e a secao 5 do PRD poe "mudanca de identidade visual, tokens ou temas" explicitamente fora de escopo.

**Instrucao direta: NAO converter cor nenhuma nesta fase**, nem as duas de `aceitar-convite` que estao no arquivo que a fase toca. Vai como pendencia 2. A verificacao e "o diff nao introduz nenhuma nova", nao "o grep zera".

---

## 6. Arquivos afetados

**8 arquivos, 0 novos.** Seis deles recebem exclusivamente a troca `vh` para `dvh`.

| # | Arquivo | Itens | Linhas |
|---|---|---|---|
| 1 | `src/pages/aceitar-convite.tsx` | 4.1 A1+A2, 4.3 | `:395`, `:403`, `:428`, `:452`, `:460`, `:500`, `:545` |
| 2 | `src/pages/auth.tsx` | 4.1 A1+A2 | `:36`, `:62` |
| 3 | `src/pages/auth-cadastro.tsx` | 4.1 A1+A2 | `:12`, `:23` |
| 4 | `src/pages/update-password.tsx` | 4.1 A1 | `:52` |
| 5 | `src/pages/not-found.tsx` | 4.1 A1 | `:6` |
| 6 | `src/pages/acesso-negado.tsx` | 4.1 A2 | `:10` |
| 7 | `src/components/legal/legal-document-page.tsx` | 4.1 A1 | `:90` |
| 8 | `src/components/auth/protected-route.tsx` | 4.1 A2 | `:23`, `:39` |
| 9 | `src/components/shared/page-loading-skeleton.tsx` | 4.1 A2 | `:5` |
| 10 | `src/components/pipeline/edit-lead-modal.tsx` | 4.2 | `:216`, `:217`, `:218` |

São **10 arquivos**, mais esta Spec = **11 no diff**.

**Ordem sugerida:** primeiro os seis de troca pura (`2, 3, 4, 5, 6, 7, 8, 9`), que sao mecanicos e destravam a verificacao de altura; depois o `1`, que mistura os dois tipos; por ultimo o `10`, que e o unico com medicao propria a defender.

**Nenhuma linha de logica de negocio, formulario, schema `zod`, chamada ao Supabase ou fluxo de autenticacao e tocada.** Se algo em `aceitar-convite.tsx` parecer exigir mudanca fora das 7 linhas listadas, **PARAR e reportar**: aquele arquivo tem 609 linhas de maquina de estado de convite e nada disso e responsividade.

---

## 7. Fora de escopo

**O shell da Fase 1, sem excecao nesta fase.** `app-sidebar.tsx` (inclusive o `h-screen` de `:254`, ver 4.1 A3), `mobile-topbar.tsx`, `sheet.tsx`, `use-mobile.ts`, `main-layout.tsx`. A Fase 5B abriu uma excecao de uma palavra e ela ja esta aplicada e mergeada; **esta fase nao abre nenhuma.**

**Os globais da Fase 2:** `dialog.tsx`, `tabs.tsx` (ver a restricao 1 de 4.2), os grids e o padding ja aplicados.

**Toda a logica de autenticacao:** `use-auth.ts`, `auth.service.ts`, `auth.store.ts`, `password-rules.ts`, os `zod` schemas, o `accept_invitation` RPC.

**Cores hardcoded**, ver 5.4.

**Testes automatizados de responsividade.** O Playwright **esta instalado** (`test:e2e` em `package.json`), o que torna tentador escrever um teste de viewport aqui. **A secao 5 do PRD poe isso explicitamente fora de escopo.** Vai como pendencia 3.

**Sempre fora:** `src/styles/globals.css`, `supabase/`.

---

## 8. Pendencias registradas

| # | Pendencia | Onde | Destino |
|---|---|---|---|
| 1 | `color-picker.tsx:28` fica como excecao permanente ao criterio 10; o criterio deveria dizer "grade de layout" e nao "qualquer `grid-cols-N`" | `PRD-responsividade.md` secao 6 criterio 10 | revisao do PRD |
| 2 | **276 cores hardcoded em 49 arquivos.** Nao e responsividade, e divida de design system | produto inteiro | frente propria |
| 3 | Playwright instalado e sem nenhum teste de viewport, sendo que os 10 criterios da secao 9.2 sao manuais e se repetem a cada fase | `e2e/` | quando a frente fechar |
| 4 | `break-words` so existe no ramo externo do `MarkdownLink`; link nomeado interno com URL longa perde a protecao | `legal-document-page.tsx:26` e `:34` | se surgir link interno longo |
| 5 | `whitespace-nowrap` no `TabsTrigger` global obriga cada `TabsList` apertado a se defender sozinho; ha outros `TabsList` no produto que ninguem mediu | `tabs.tsx:29` | passada propria de `Tabs` |
| 6 | O `h-auto` de `edit-lead-modal.tsx:215` fica no codigo sendo inerte contra o defeito que motivou a adicao dele | `edit-lead-modal.tsx:215` | nenhum, e registro |
| 7 | Herdadas e ainda abertas da 5B: rotulo do `MiniChart` sobreposto entre 1024 e ~1400px; `monthly-comparison-chart.tsx` e codigo morto; `alert-dialog.tsx` sem o `max-h` que o `dialog.tsx` ganhou | varios | ver 5B secao 9 |

---

## 9. Verificacao

### 9.1 Automatica

| # | Comando | Criterio |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0, sem saida |
| 2 | `npm run build` | sem erro |
| 3 | `npm run test:run` | **sem regressao.** Existem `src/pages/termos.test.tsx` e `src/pages/privacidade.test.tsx`, e o item 4.1 toca o componente que os dois renderizam. Se algum quebrar, **PARAR e reportar**, nao ajustar o teste |
| 4 | `npm run lint` | linha de base no **merge-base**, `git checkout --detach $(git merge-base develop HEAD)`, **nunca `git stash`**. Reportar "X na base, Y na branch, Z novos" e **tambem quais arquivos tocados aparecem na saida e com quais achados** |
| 5 | `git diff --stat develop` | **no maximo 11 arquivos**: os 10 da secao 6 mais esta Spec |
| 6 | `grep -rn "h-screen\|min-h-screen" src/` | deve restar **exatamente 1**: `app-sidebar.tsx:254`. Qualquer outro numero significa que a secao 4.1 foi aplicada errada |
| 7 | `git diff develop -- src/components/layout/ src/components/ui/ src/styles/ supabase/` | **vazio.** Nenhuma excecao ao shell nem aos globais nesta fase |
| 8 | os cinco greps da secao 5.1 | saida transcrita no relatorio, nao parafraseada |
| 9 | `git ls-files docs/SPEC-responsividade-fase6-verificacao.md` | tem que retornar o caminho. **Doc que nao entra em commit nao existe** |

### 9.2 Manual, e e o que fecha o item 17

Os dez criterios que grep nenhum alcanca. Viewports alvo: **360, 390, 414** e **1440** para nao regressao.

| # | Verificacao | Criterio do PRD |
|---|---|---|
| 10 | As 11 rotas autenticadas em 360, 390 e 414: nenhuma rola horizontalmente no `<body>` | 1 |
| 11 | As 7 rotas publicas mais o 404, nos mesmos tres: idem | 1, item 16 |
| 12 | **Em aparelho real, numa tela publica: rolar para o chrome do navegador retrair e voltar. O cartao fica centralizado nos dois estados e a pagina nao ganha rolagem fantasma.** E o unico teste do 4.1 inteiro, e ele e falsificavel: antes do `dvh` a pagina rolava ~110px sem ter o que mostrar | 4.1 |
| 13 | `/aceitar-convite` no estado "Aceitar convite" em 360px: os dois botoes na mesma linha, sem estouro. **Se nunca estouraram, o `flex-wrap` de 4.3 e inerte e esta correto assim mesmo** | 4.3 |
| 14 | **`edit-lead-modal` em 360px: as tres abas legiveis, sem sobreposicao de "Informacoes" sobre "Tarefas".** Fecha o item 14 da 5B, que ficou aberto | 4.2 |
| 15 | Todo modal cabe em 390 × 640 com os botoes de acao alcancaveis | 11 |
| 16 | Alvos de toque com no minimo 44 × 44px no mobile | 13 |
| 17 | Nenhum texto truncado de forma ilegivel em 360px | 14 |
| 18 | `/inbox` e `/pipeline` abaixo de 1024px continuam como as Fases 5A e 5B entregaram. **Nao regressao das duas ultimas fases** | 15, 16 |
| 19 | Os tres temas (light, dark, sand) nas telas publicas. **Atencao ao `legal-document-page.tsx:67`, que forca tema claro e restaura ao sair**: entrar em `/termos` a partir do dark e voltar tem que devolver o dark | 9 |

### 9.3 Nao regressao em desktop

| # | Verificacao | Viewport |
|---|---|---|
| 20 | **O `dvh` nao muda nada no desktop**, onde a altura da viewport e estavel. Conferir `/auth`, `/termos` e uma rota autenticada. E o mesmo teste que protegeu a excecao da 5B | 1440px |
| 21 | `edit-lead-modal` em 1440px: as abas voltam a `text-sm px-3` pelo `sm:`, identicas as de hoje | 1440px |

**O item 12 e o unico que so aparelho real resolve, e ele e o que justifica a fase inteira.** Os itens 10, 11 e 15 a 19 saem no device mode do DevTools.

---

## 10. O que esta fase nao prova

Registrado aqui de proposito, seguindo o padrao de `docs/audits/responsividade-fase3-item10-2026-08-03.md`.

1. **Nao foi verificado que as 17 linhas do 4.1 estavam quebradas.** O mecanismo foi confirmado em aparelho real na Fase 5B, num arquivo diferente. Ver a nota em 4.1.
2. **Os seis casos de spinner do grupo A2 nao tem defeito observavel.** A troca ali e por coerencia, para que a proxima pessoa copie a linha certa. Isso e explicitacao, nao correcao, e a mensagem de commit deve dizer isso.
3. **O criterio 18 nao sera atendido ao pe da letra e nenhuma fase desta frente iria atende-lo.** Ver 5.4.
4. **A varredura da secao 9.2 cobre as 11 rotas autenticadas com um olhar, nao com medicao por elemento.** Ela detecta estouro, nao o antecipa. As Fases 2 a 5B fizeram a antecipacao; esta confere o resultado.
