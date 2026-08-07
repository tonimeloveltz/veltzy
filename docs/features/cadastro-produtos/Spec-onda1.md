# Spec: Cadastro de produtos, Onda 1

> Feature: `cadastro-produtos` / Onda 1
> PRD: `docs/features/cadastro-produtos/PRD.md`
> Status: Implementada, aguardando migration no Hub e PVO
> Data: 2026-08-06, revisada em 2026-08-07
> Branch: `feat/cadastro-produtos-develop`, a partir de `origin/develop` (`ff51897`)

---

> **Revisão de 07/08/2026, pedida pela Leticia e já implementada.** Duas mudanças,
> aplicadas ao longo de todo este documento:
>
> 1. **No chat vai apenas o link.** Nome, categoria e descrição servem para o
>    vendedor achar o produto certo no popover, não para o cliente ler. Ver 5.1.
> 2. **Produtos ganharam categoria**, no mesmo desenho dos scripts. Isso reverte
>    a D2 do PRD e muda o `CREATE TABLE` da seção 1.
>
> A migration **ainda não foi aplicada** quando isto foi escrito, então a coluna
> `category` entra no `CREATE TABLE` e não exige `ALTER TABLE`. Se este documento
> for lido depois da aplicação, conferir antes qual dos dois caminhos vale.
> **Ela foi aplicada horas depois, ainda na versão incompleta: ver 1.2.**

> **Troca de base, 07/08/2026.** A frente nascia de `feat/google-calendar-convite-inbox`,
> porque dependia da barra de composição reorganizada lá. A Leticia decidiu
> desempilhar: a branch agora é `feat/cadastro-produtos-develop`, a partir de
> `origin/develop` (`ff51897`), sem nada do Calendar.
>
> **Consequência de escopo:** a reorganização da barra (menu `Plus` abaixo de
> 640px e `ReplyTemplatesPopover` controlado) **passou a pertencer a esta frente**.
> Sem ela, o quarto ícone quebraria a barra a 360px, que é a conta da seção 6.
> O Calendar, quando voltar, só acrescenta o botão de agendar a uma barra que já
> vai estar pronta — e o `chat-input.tsx` vai conflitar no merge, previsivelmente
> e de forma resolvível.

## 0. Resumo

Aba nova em Gestão com CRUD de produtos (nome, categoria, descrição, link), e um popover na barra do inbox que insere **o link do produto** na mensagem. É o padrão de `reply_templates` replicado, com três diferenças deliberadas, marcadas com **DIFERENÇA** ao longo do texto.

## 1. Migration, que vai no repo do HUB

**Não entra em `supabase/migrations/` deste repo.** O Hub é dono do histórico de migrations do banco Central, e isso vale mesmo para tabela do schema `veltzy`, porque migration é rastreada por banco. Ver `docs/AMBIENTES.md`.

Arquivo novo no repo do Hub, com timestamp, nunca editando a baseline. Aplicação no staging pela Leticia (`db push` com o `●` confirmado em `hfebvugdsztnzgpybdwj`); produção é do Toni, em passo separado.

```sql
CREATE TABLE veltzy.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  link TEXT,
  category TEXT NOT NULL DEFAULT 'geral',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_company_id ON veltzy.products(company_id);

ALTER TABLE veltzy.products ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado da empresa. O vendedor precisa ler para usar no chat.
CREATE POLICY "vz_products_select" ON veltzy.products
  FOR SELECT TO authenticated
  USING (
    company_id = veltzy.get_current_company_id()
    OR veltzy.is_super_admin()
  );

-- Escrita: admin e manager, alinhado com o que a 060 decidiu para os scripts.
CREATE POLICY "vz_products_all" ON veltzy.products
  FOR ALL TO authenticated
  USING (
    company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager()
    OR veltzy.is_super_admin()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON veltzy.products TO authenticated;
GRANT ALL ON veltzy.products TO service_role;

CREATE TRIGGER on_products_updated BEFORE UPDATE ON veltzy.products
FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
```

`category` copia a definição exata de `veltzy.reply_templates`, inclusive o default `'geral'`: é o que faz a tela de produtos e a de scripts se comportarem igual sem nenhum tratamento de nulo espalhado pelo código.

### 1.1 Três coisas que faltavam neste bloco, e que falham em silêncio

Até 07/08/2026 esta seção tinha `ENABLE ROW LEVEL SECURITY` e descrevia as policies **em prosa**, sem o SQL. Quem copiasse o bloco criaria a tabela com RLS ligada e **policy nenhuma**, o que no Postgres não é "acesso liberado", é **negar tudo**. A aba abriria, a lista viria vazia, o cadastro falharia, e nada disso apareceria como erro de sistema. As três correções:

**1. As policies agora estão no SQL, não na prosa.** Nomes no padrão `vz_*` de `veltzy.reply_templates` (`010_central_migration.sql:527-528`, com a `vz_rt_all` atualizada pela `060`).

`vz_products_all` é `FOR ALL` **sem** `WITH CHECK`, de propósito e igual à `vz_rt_all`: quando o `WITH CHECK` é omitido, o Postgres reaproveita a expressão do `USING` para validar `INSERT` e `UPDATE`. Não é esquecimento, não "conserte".

**2. Os `GRANT` são obrigatórios para tabela nova.** A `011_central_complement.sql:166` deu `GRANT ALL ON ALL TABLES IN SCHEMA veltzy TO authenticated`, mas isso vale para as tabelas **que existiam naquele momento**, e **não há `ALTER DEFAULT PRIVILEGES` em migration nenhuma do repo**. Tabela criada depois nasce sem privilégio, e aí nem policy correta salva: o erro é `permission denied`, antes da RLS. O precedente é a `054_create_deals_table.sql:64-65`, a tabela `veltzy` mais recente, que concede explicitamente. Fizemos igual.

**3. O trigger usa `veltzy.handle_updated_at()`, não `public.set_updated_at()`.** Esta Spec pedia `set_updated_at` "conferindo se a baseline do Hub já a define". Não precisa conferir: `veltzy.handle_updated_at()` **é criada no repo**, em `010_central_migration.sql:287`, e é a que `veltzy.reply_templates` usa (`010:461`). Já a `public.set_updated_at()` é usada por `015` e `017` e **não é criada por migration nenhuma** — é resquício da era Lovable, o mesmo buraco achado na frente do Google Calendar. Entre as duas, use a que tem definição rastreável.

As três compartilham a mesma assinatura de falha: o `db push` passa, a tabela existe, e a feature não funciona sem nenhuma mensagem de erro que aponte para a causa.

**Enquanto a migration não estiver aplicada no staging, esta branch não vai para a develop.** O portão é o merge, não o código: é a regra que o fluxo do time já define ("enquanto a migration não estiver aplicada, a feature que depende dela fica em stand by"). A aba existe no código desde o primeiro commit, e isso é correto enquanto a branch estiver isolada.

Deliberadamente **não há feature flag** para isso. Seria construir mecanismo para um problema que o processo resolve, e sobraria um flag órfão depois.

O que o código faz por si: o `ProductsManager` **degrada com elegância** se a query falhar, mostrando estado de indisponível em vez de quebrar. Isso vale independentemente da migration, e cobre também RLS negando por role inesperada.

### 1.2 Correção, para quem já aplicou a versão incompleta

A Leticia aplicou a migration no staging **antes** da correção da 1.1, em 07/08/2026. Ou seja existe hoje uma `veltzy.products` com RLS ligada e sem policy, o que nega tudo.

**Migration aplicada não se edita.** O histórico já registrou aquele arquivo, o `db push` não o reexecuta, e alterá-lo faz repo e banco divergirem sem aviso. A correção é **arquivo novo**, com timestamp posterior, no repo do Hub.

Antes de rodar, conferir o que de fato ficou no banco (leitura pura, no SQL editor do staging):

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'veltzy' AND table_name = 'products';

SELECT policyname, cmd FROM pg_policies
 WHERE schemaname = 'veltzy' AND tablename = 'products';

SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'veltzy.products'::regclass AND NOT tgisinternal;

SELECT grantee, privilege_type FROM information_schema.role_table_grants
 WHERE table_schema = 'veltzy' AND table_name = 'products';
```

A correção abaixo é **idempotente**: roda igual com ou sem a coluna `category`, com ou sem policy criada, e pode ser reexecutada sem erro.

```sql
-- Corrige veltzy.products: coluna category, policies, grants e trigger.
-- A migration original criou a tabela com RLS ligada e sem policy, o que no
-- Postgres nega tudo, e sem GRANT, o que falha antes ainda da RLS.

ALTER TABLE veltzy.products
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'geral';

DROP POLICY IF EXISTS "vz_products_select" ON veltzy.products;
CREATE POLICY "vz_products_select" ON veltzy.products
  FOR SELECT TO authenticated
  USING (
    company_id = veltzy.get_current_company_id()
    OR veltzy.is_super_admin()
  );

DROP POLICY IF EXISTS "vz_products_all" ON veltzy.products;
CREATE POLICY "vz_products_all" ON veltzy.products
  FOR ALL TO authenticated
  USING (
    company_id = veltzy.get_current_company_id() AND veltzy.is_admin_or_manager()
    OR veltzy.is_super_admin()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON veltzy.products TO authenticated;
GRANT ALL ON veltzy.products TO service_role;

-- Os dois DROP cobrem os dois nomes possiveis: o da prosa da Spec antiga
-- (`set_updated_at`) e o atual.
DROP TRIGGER IF EXISTS set_updated_at ON veltzy.products;
DROP TRIGGER IF EXISTS on_products_updated ON veltzy.products;
CREATE TRIGGER on_products_updated BEFORE UPDATE ON veltzy.products
FOR EACH ROW EXECUTE FUNCTION veltzy.handle_updated_at();
```

Depois de aplicar, o que prova que funcionou são os passos 1 e 4 da 8.2, nesta ordem: criar um produto como admin ou manager, e abrir a aba como seller e ver a lista carregar.

**Para uma tabela nova, o bloco a copiar continua sendo o da 1.1, não este.** Este arquivo existe só porque a primeira versão já foi aplicada.

## 2. Tipo

`src/types/database.ts`, junto dos demais:

```ts
export interface Product {
  id: string
  company_id: string
  name: string
  description: string | null
  link: string | null
  category: string
  is_active: boolean
  created_at: string
  updated_at: string
}
```

`category` é `string` e não `string | null`, porque a coluna é `NOT NULL DEFAULT 'geral'`.

## 3. Service e hook

**`src/services/products.service.ts`** (novo), cópia estrutural de `reply-templates.service.ts`: `getProducts`, `createProduct`, `updateProduct`, `deleteProduct`. Todas recebem `companyId` e filtram por ele além da RLS, como manda a regra multi-tenant do projeto. `getProducts` filtra `is_active = true` e ordena por `category` e depois `name`, como o de templates ordena por categoria e título. `createProduct` e `updateProduct` aceitam `category`, com `'geral'` quando o campo vem vazio.

**`src/hooks/use-products.ts`** (novo), cópia de `use-reply-templates.ts`: `useProducts`, `useCreateProduct`, `useUpdateProduct`, `useDeleteProduct`, com `queryKey: ['products', companyId]` e toasts nas mutations.

**DIFERENÇA 1:** o `useDeleteTemplate` de hoje não tem toast de sucesso (`use-reply-templates.ts`), só de erro. Manter a assimetria não tem motivo; o de produtos toasta nos dois casos.

## 4. Aba em Gestão

**`src/components/gestao/products-manager.tsx`** (novo), ao lado de `goals-manager.tsx`. Cópia estrutural de `scripts-manager.tsx`, com:

- `canManage` derivado igual (`useAuthStore` + roles `admin`, `manager`, `super_admin`), controlando o botão de novo e os ícones de editar e remover.
- Formulário de criação inline no bloco destacado, edição inline na própria linha, `confirm()` antes de remover. Mesmo desenho, mesmas classes.
- Campos: **Nome** e **Link** lado a lado em `grid sm:grid-cols-2`, **Categoria** e **Descrição** abaixo, a segunda em `textarea`.
- Busca por nome e descrição, com o `<select>` de categorias ao lado, exatamente como no original.

**DIFERENÇA 2 (revogada em 07/08/2026):** esta Spec dizia "sem filtro de categoria, porque não há categoria". A Leticia pediu categoria, então o `<select>` de filtro e o `<datalist>` de sugestão **voltam**, com o mesmo desenho de `scripts-manager.tsx`. O que sobra da diferença é nada: nesse ponto produtos e scripts são iguais de propósito.

Na lista, cada linha mostra o nome em destaque com a categoria em badge ao lado, a descrição truncada, e o link como `<a>` com `target="_blank" rel="noopener noreferrer"`, truncado. Sem link cadastrado, não renderiza a âncora.

**`src/pages/gestao.tsx`**: mais um `TabsTrigger value="produtos"` e o `TabsContent` correspondente. O `TabsList` já tem `flex-wrap h-auto gap-1`, então a aba nova quebra linha em vez de estourar, e não precisa de defesa nova.

Na `origin/develop` a aba "Logs comerciais" **não existe mais** (foi removida em um dos 16 commits à frente de `62fa9b0`), então Produtos entra como **sexta** aba, não sétima como esta Spec dizia quando a base era o Calendar.

## 5. Popover no inbox

**`src/components/inbox/products-popover.tsx`** (novo), cópia estrutural de `reply-templates-popover.tsx`, incluindo a decisão de layout que aquele arquivo carrega:

> O componente retorna **ou** o botão **ou** o painel absoluto, **sem elemento em volta**. É isso que faz o `hidden` do gatilho virar `display:none` e sair do fluxo flex sem consumir gap. Envolver num `<div>` "para organizar" quebra a conta de largura da barra sem quebrar nada visivelmente. Está explicado na seção 3.4 da Spec do Google Calendar.

Props: `open`, `onOpenChange`, `triggerClassName`, `onSelect`. Ícone `Package`. Busca por nome e descrição. Cada item mostra nome e descrição truncada.

**O popover não filtra por categoria, e é deliberado:** o de templates também não, e a categoria serve para organizar o cadastro em Gestão, não para navegar durante a conversa, onde o vendedor está com pressa e a busca por nome resolve. Se a lista crescer a ponto de a busca não bastar, o padrão para copiar já existe no `products-manager.tsx`.

**`src/components/inbox/chat-input.tsx`** ganha:

- O `ProductsPopover` com `triggerClassName="hidden sm:inline-flex"`.
- Um quarto item no menu `Plus`, "Produtos".
- Estado `productsOpen`, e a garantia de que **os dois popovers não abrem juntos**: abrir um fecha o outro. São ambos absolutos e ancorados na mesma barra, então se sobrepõem. A exclusão mútua vive em duas funções passadas como `onOpenChange` para os dois componentes **e** para os itens do menu, para valer por qualquer caminho de abertura.

**Ordem, e ela é a mesma nos dois layouts:** `templates, produtos, anexo, agendar`. O critério é a natureza da ação, não a ordem de chegada: templates e produtos **inserem texto na mensagem**, anexo e agendar fazem outra coisa, então os dois primeiros ficam juntos. Manter a mesma ordem no menu agrupado e na linha de ícones é o que o vendedor percebe ao alternar entre celular e desktop.

### 5.1 O que é inserido na mensagem

**DIFERENÇA 3, e é a mais importante.** O script **substitui** o conteúdo digitado (`setContent(t)`), porque o script *é* a mensagem. O produto **é acrescentado ao final**, porque é complemento do que o vendedor está escrevendo.

**Do produto vai apenas o `link`.** Nome, categoria e descrição existem para o vendedor achar o produto certo no popover; quem lê a mensagem é o cliente, e para ele o link basta. Foi decisão da Leticia em 07/08/2026, revisando o bloco de três linhas que esta seção descrevia antes.

Se já houver texto no campo, o link entra depois de uma linha em branco. Se estiver vazio, entra sozinho:

```
Oi Joao, segue o que conversamos:

https://veltzy.com/planos/pro
```

Em ambos os casos o foco volta para o textarea, com o cursor no fim, e a altura é reajustada (`adjustHeight`), senão o texto inserido nasce cortado.

**Produto sem link cadastrado avisa, não faz nada em silêncio.** `toast.error('Este produto nao tem link cadastrado')`, e o campo de mensagem fica intacto. Este caso não existia enquanto o bloco carregava o nome junto: com link-only, um produto sem link tornaria o clique um no-op invisível, e o vendedor concluiria que o botão está quebrado.

**A pergunta que decidiu isto, registrada porque ela volta:** "apenas o link, similar ao template" podia significar *substituir* como o template faz. Foi perguntado à Leticia, com os dois resultados lado a lado, e ela escolheu **acrescentar**. Ou seja a D3 do PRD sobrevive intacta: mudou o que é acrescentado, não o fato de acrescentar.

## 6. Medição da barra de composição

A barra é reorganizada **nesta frente**, não na do Calendar. Método das fases de responsividade.

**Abaixo de 640px**, templates, produtos e anexo colapsam atrás de um gatilho `Plus`. Áudio, textarea e enviar continuam sempre visíveis, porque áudio é ação de um toque e os outros dois são o caminho principal:

```
360   viewport
-24   p-3 nas duas bordas
-32   Plus
-32   áudio
-40   enviar
-24   três gaps de gap-2
----
208px para o textarea
```

**São 208px contra os 168px de antes da reorganização.** O agrupamento não é só o preço de caber o botão novo: devolve 40px ao campo e resolve o placeholder "Digite uma mensagem..." (22 caracteres, 161px a 7,3px por caractere), que **já nascia cortado** com três ícones em linha.

**A partir de 640px**, os quatro ícones ficam em linha:

```
640   viewport no pior caso
-24   p-3 nas duas bordas
-128  quatro ícones de 32px (templates, produtos, anexo, áudio)
-40   enviar
-40   cinco gaps de gap-2
----
408px para o textarea
```

Contra os 144px de área útil que o placeholder pede, sobra folga de quase 200%. **Sem risco.**

O `Plus` fica com três itens, confortável no painel de `w-48`. Quando o Calendar voltar, ele acrescenta o quarto item e o quinto ícone, e a conta de 640px cai para 368px, ainda folgada.

## 7. Arquivos afetados

**No repo do Hub (1):** a migration da seção 1.

**Novos neste repo (4):** `products.service.ts`, `use-products.ts`, `products-manager.tsx`, `products-popover.tsx`.

**Alterados (4):** `database.ts` (tipo), `gestao.tsx` (aba), `chat-input.tsx` (reorganização da barra, popover e item do menu), `reply-templates-popover.tsx` (passa a ser controlado pela barra).

`reply-templates-popover.tsx` entrou na lista com a troca de base: a exclusão mútua entre os dois popovers exige que a barra controle o estado dos dois, e na `develop` esse componente ainda controla o próprio.

`chat-input.tsx` é o único com risco de regressão, porque a mudança **reorganiza a barra inteira**, não só acrescenta um botão.

## 8. Verificação

### 8.1 Automática

```bash
npx tsc --noEmit
npm run lint      # comparar com baseline do merge-base, nunca com git stash
npm run build
npm test
```

### 8.2 Manual (PVO, o quarto item)

1. Gestão > Produtos: criar produto com os quatro campos, categoria inclusive. Aparece na lista, com a categoria em badge.
2. Criar produto **sem link e sem descrição**, só nome. Salva, a linha não mostra âncora quebrada, e a categoria nasce `geral` sem ninguém digitar.
3. Editar inline e remover, com o `confirm()` aparecendo. A edição inclui a categoria.
4. Entrar com um usuário **seller**: a aba aparece, a lista é visível, e não há botão de novo, editar ou remover.

   **Este passo é o canário da RLS, junto com o passo 1.** O passo 1 (criar como admin ou manager) prova a `vz_products_all` mais os `GRANT` de escrita; este prova a `vz_products_select` mais o `GRANT` de leitura. Se a 1.1 tiver sido ignorada na hora de escrever a migration do Hub, é aqui que aparece: lista vazia para todo mundo, ou erro de `permission denied` no console, sem nada quebrar na tela.
5. **Cadastrar dois produtos em categorias diferentes** e conferir o filtro `<select>`: seleciona uma categoria, some o da outra. E o `<datalist>` do campo sugere as categorias já usadas.
6. No inbox, abrir o popover de produtos e escolher um. **Só o link entra no campo**, sem nome nem descrição.
7. **Digitar um texto antes** e então escolher o produto: o texto digitado **permanece**, e o link entra depois de uma linha em branco. Este é o passo que distingue produtos de scripts.
8. Escolher um **produto sem link cadastrado**: aparece o toast "Este produto nao tem link cadastrado" e o campo de mensagem não muda.
9. Abrir o popover de templates e, sem fechar, abrir o de produtos: só um fica aberto.
10. Enviar a mensagem e conferir que o link chega clicável no WhatsApp.

11. **Altura do campo.** Inserir um **script de várias linhas** e conferir que ele aparece inteiro (hoje falha, ver 8.3). Depois digitar duas ou três linhas e inserir um produto, conferindo que o campo cresce em vez de cortar.

    Os dois exercitam o mesmo `focusTextareaEnd`, e **nenhum teste automatizado alcança isso**: em jsdom o `scrollHeight` é sempre zero, então os 127 testes passam mesmo se a altura nunca for reajustada. Este item é *aplicado, não verificado* até alguém abrir no navegador.

    Nota: com link-only, o produto sozinho não estica mais o campo, porque é uma linha só. O caminho do produto continua passando pelo `focusTextareaEnd` por causa do texto que já estava escrito, e é isso que este passo exercita.

### 8.3 Não regressão

12. Scripts de Resposta continua funcionando em Gestão e no inbox, inclusive **substituindo** o texto digitado, que é o comportamento dele.

   **Correção in-scope, achada durante esta onda:** a inserção de script faz `setContent(t)` sem chamar `adjustHeight`, então um script de várias linhas **nasce cortado hoje**, mostrando só a primeira linha até o vendedor digitar algo. É defeito anterior a esta onda e foi corrigido aqui, com o mesmo `requestAnimationFrame` usado em 5.1.

   O motivo de corrigir fora do escopo: esta Spec documenta que produto e script se comportam diferente **de propósito**. Um defeito não corrigido ao lado de uma diferença deliberada faz o vendedor ler a diferença como "um funciona e o outro é meio quebrado", e contamina a decisão que queríamos deixar clara.

   Verificar: inserir um script de **várias linhas** e conferir que ele aparece inteiro no campo.
13. Anexo, áudio e agendar reunião continuam funcionando pelos dois caminhos, agrupado e em linha.
14. Gravar áudio ainda esconde os demais controles (`isRecording` em `chat-input.tsx`).
15. A barra a 360px e a 640px, em aparelho real.

## 9. Fora de escopo

Preço, imagem, vínculo com `deals`, estoque, importação CSV, uso pelo SDR IA, ordenação manual, filtro por categoria **dentro do popover** do inbox, e UI para `is_active` (o campo existe e é respeitado pelo service, mas não é editável nesta onda).

## 10. Pendências

1. `is_active` não tem UI. Produto sai de circulação apagando, o que perde o histórico. Vale um toggle quando alguém pedir.
2. ~~Se a lista passar de umas vinte linhas, categoria e filtro entram.~~ **Resolvida em 07/08/2026:** a Leticia pediu categoria antes de a lista crescer, e ela entrou nesta mesma onda. O que sobrou da pendência é o filtro por categoria dentro do popover do inbox, que continua fora de escopo pelo motivo da seção 5.
4. **A descrição não vai mais para o cliente.** Com link-only, ela existe só para o vendedor reconhecer o produto no popover. Se ninguém preencher, o popover fica com uma lista de nomes secos, e a busca por descrição deixa de servir para alguma coisa. Vale olhar depois de algumas semanas de uso se o campo se justifica.
3. A migration `060` traz o comentário "EXECUTAR VIA SQL EDITOR (banco compartilhado, nao usar CLI)", que contradiz o processo atual descrito em `docs/AMBIENTES.md`. É resquício anterior à separação Hub/Veltzy. Não afeta esta onda, mas confunde quem for copiar o arquivo como molde.

5. **Não existe `ALTER DEFAULT PRIVILEGES` no schema `veltzy`, e isso é armadilha para toda tabela futura, não só esta.** A `011` concedeu privilégio em `ALL TABLES` uma vez, e desde então cada tabela nova depende de alguém lembrar do `GRANT` na mão. A `054` lembrou; a `015` (`veltzy.tasks`) **não** tem `GRANT` no arquivo e funciona hoje, o que sugere concessão manual fora do versionamento em algum momento. Um `ALTER DEFAULT PRIVILEGES IN SCHEMA veltzy GRANT ... TO authenticated, service_role` na baseline do Hub fecharia a classe inteira. Decisão de quem cuida do Hub, fora do escopo desta onda.
