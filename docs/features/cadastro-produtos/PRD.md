# PRD: Cadastro de produtos com envio no chat

> Feature: `cadastro-produtos` / Onda 1
> Status: Aprovado, implementado, aguardando migration no Hub e PVO
> Data: 2026-08-06, revisado em 2026-08-07 (D2 revogada, D4 nova)

---

## 1. Problema

O vendedor conversa com o lead e precisa mandar o link de um produto. Hoje ele sai do Veltzy para buscar a URL, no site, no drive ou numa conversa antiga, e volta para colar. O link chega errado com frequência, e cada vendedor manda uma descrição diferente do mesmo produto.

Não existe lugar no Veltzy onde a empresa diga "estes são os nossos produtos e estes são os links certos".

**O que esta entrega resolve:** a empresa cadastra os produtos uma vez, e o vendedor insere o link certo na conversa sem sair dela.

## 2. Modelo que estamos copiando

Isto é, deliberadamente, o mesmo desenho dos **Scripts de Resposta**, que já funciona e já é conhecido pelo time:

| Peça | Scripts (existe) | Produtos (novo) |
|---|---|---|
| Onde se gerencia | Gestão > Scripts, `scripts-manager.tsx` | Gestão > Produtos |
| Quem gerencia | admin, manager, super_admin | igual |
| Quem enxerga | todos da empresa | igual |
| Onde se usa | popover na barra do inbox | igual |
| Tabela | `veltzy.reply_templates` | `veltzy.products` |

Copiar o padrão não é preguiça: é o que faz a feature nascer com busca, filtro, edição inline e permissão já resolvidos do jeito que o time espera.

## 3. Decisões

**D1. Quatro campos: nome, categoria, descrição e link.** Sem preço, sem SKU, sem unidade, sem estoque. O objetivo é mandar o link certo, não gerir catálogo comercial. Preço fica de fora conscientemente: ele muda, envelhece no cadastro, e mandar preço desatualizado para o cliente é pior do que não mandar preço.

**D2 (revogada em 07/08/2026). ~~Sem categoria nesta onda.~~** O argumento original era que a lista de produtos costuma ser curta e a busca por nome resolve, deixando categoria para quando passasse de umas vinte linhas. A Leticia pediu categoria já, para ficar igual ao cadastro de scripts que o time já usa. Entrou nesta mesma onda, no mesmo desenho: campo com sugestão dos valores existentes, filtro na listagem e badge na linha.

**D3. O produto entra na conversa somando, não substituindo.** Ao escolher um script, o texto digitado é **substituído**, porque o script *é* a mensagem. O produto é um complemento ao que o vendedor está escrevendo, então ele é **acrescentado** ao final. A diferença de comportamento entre os dois botões vizinhos é deliberada e decorre da natureza do conteúdo.

**D4 (nova em 07/08/2026). Para o cliente vai só o link.** Nome, categoria e descrição servem para o vendedor achar o produto certo no popover; nenhum deles entra na mensagem. Quem lê a mensagem é o cliente, e para ele o link basta, com o texto de venda escrito pelo próprio vendedor em volta.

Isto **não enfraquece a D3**: quando perguntado se "só o link, similar ao template" queria dizer substituir como o template faz, a resposta foi acrescentar. Mudou o que é acrescentado, não o fato de acrescentar.

Efeito colateral que a D4 cria: produto cadastrado sem link vira um clique que não faz nada. Por isso ele avisa em vez de ficar mudo.

**D4. O gatilho é mais um item na barra de composição.** Em telas de 640px para cima vira o quinto ícone; abaixo disso entra no menu `Plus` que já agrupa templates, anexo e agendar reunião. A barra foi reorganizada na frente do Google Calendar exatamente para comportar isso.

## 4. Fluxo

**Cadastrar.** Gestão > Produtos. Botão "Novo produto", quatro campos, salvar. A lista mostra nome com a categoria em badge, descrição truncada e link, com editar e remover para quem tem permissão. Busca por nome e descrição, e filtro por categoria.

**Usar.** No inbox, o vendedor abre o popover de produtos, busca, e clica. **O link** é acrescentado ao fim do que ele já escreveu, e ele ainda pode editar antes de enviar.

## 5. Modelo de dados

Tabela nova `veltzy.products`: `id`, `company_id`, `name`, `description`, `link`, `category`, `is_active`, `created_at`, `updated_at`. Espelha `reply_templates` trocando `content` por `description` mais `link`, e mantendo `category` com a mesma definição (`TEXT NOT NULL DEFAULT 'geral'`).

`is_active` entra mesmo sem aparecer na UI desta onda, porque é o que permite tirar um produto de circulação sem apagar o histórico. O service filtra por ele, como o de scripts já faz.

**A migration nasce no repo do Hub**, não no do Veltzy, porque o Hub é dono do histórico de migrations do banco Central. Isso vale mesmo para tabela do schema `veltzy`.

## 6. LGPD

**Esta feature não trata dado pessoal.** Produto, descrição e link são dados da empresa, não de pessoa natural. Não há base legal a mapear, não há consentimento a coletar e não há novo compartilhamento com operador.

O que existe é um efeito indireto: o conteúdo cadastrado será enviado a leads por WhatsApp, e continua valendo a regra que já vale para qualquer mensagem, ou seja, o vendedor é quem decide o que mandar e para quem. Nada muda no tratamento de dados do lead.

Registrado explicitamente porque "não se aplica" é uma conclusão, e conclusão precisa estar escrita para não ser confundida com esquecimento.

## 7. Fora de escopo

Preço e moeda. Imagem ou anexo do produto. Vínculo com negócio (`deals`) e cálculo de valor. Estoque. Importação em massa (CSV). Uso pelo SDR IA. Ordenação manual da lista. Filtro por categoria dentro do popover do inbox (existe na tela de Gestão, não na conversa).

## 8. Métricas de sucesso

Produtos cadastrados por empresa. Mensagens enviadas com produto inserido, sobre o total. Empresas com pelo menos um produto cadastrado, que é o indicador de que a feature saiu do papel.
