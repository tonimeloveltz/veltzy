# PRD: Instagram Direct (API oficial da Meta)

> Feature: `instagram-dm` | Data: 14/09/2026 | Autor: copiloto SDD
> Repos: `veltzy` (edge functions + front) e `hub` (migration do Central)
> Branch nos dois repos: `instagram-integration`

## 1. Contexto e problema

O Veltzy promete inbox multicanal, mas o Instagram hoje é um esqueleto que nunca foi ligado de ponta a ponta:

| Peça | Estado real (conferido em 14/09/2026) |
|---|---|
| `instagram-oauth` | Fluxo **Facebook Login** (exige Página do Facebook vinculada), Graph API **v18.0**, pega sempre a primeira página (`data?.[0]`), confere só se o usuário é da empresa, **não confere se é admin** |
| `instagram-webhook` | Só texto. Não usa `_shared/lead-inbound-handler.ts`: duplica criação de lead e deal na mão, sem dedup por `mid`, sem avatar, sem distribuição, sem mídia |
| `instagram-send` | Só texto, v18.0, **ignora a resposta da Graph API** (grava a mensagem como enviada mesmo se a Meta recusar), não grava `external_id` |
| Front | **Não existe tela de conexão.** O card em Admin > Integrações diz "Configurado pelo suporte". Nenhum código do front chama `instagram-oauth` |
| Roteamento de envio | `messages.service.ts#routeMessage` testa `phone && whatsAppConnected` **antes** do Instagram. Lead do Instagram tem `phone = 'ig_<IGSID>'`, então numa empresa com WhatsApp conectado a resposta vai para o `whatsapp-send` com um telefone inválido |
| SDR / auto-reply | Só sabem enviar por `whatsapp-send`. Se ligados para um lead do Instagram, tentariam mandar WhatsApp para `ig_...` |
| Deploy | As 3 functions estão no ar em staging e produção. Em produção ainda leem `access_token` da coluna (A7 fase 1 e 3 só no staging) |
| Secrets | `AMBIENTES.md`: Instagram não teve secrets configurados no staging |

## 2. Objetivo

Um admin conecta a conta profissional do Instagram da empresa em poucos cliques, as DMs caem no Inbox como qualquer conversa (com nome, @, foto e mídia), o vendedor responde de dentro do Veltzy respeitando as regras de janela da Meta, e o pipeline recebe o negócio.

## 3. Decisões

| # | Decisão | Por quê |
|---|---|---|
| D1 | **Instagram API com Instagram Login** (`graph.instagram.com`, escopos `instagram_business_basic` e `instagram_business_manage_messages`), não Facebook Login | Não exige Página do Facebook vinculada, que é o ponto onde PME trava. Um token só (usuário IG), sem escolher página. Host e escopos atuais da documentação |
| D2 | **Uma conta de Instagram por empresa** nesta fase (mantém `UNIQUE (company_id)`) | Resolve o caso de 95% dos clientes. Multi-conta entra depois, e o nome do segredo no Vault já é por empresa |
| D3 | **Uma conta de Instagram só pode estar ativa em uma empresa** (índice único parcial) | O webhook resolve a empresa por `entry.id`. Duas empresas com a mesma conta tornariam a entrega ambígua (vazamento entre tenants) |
| D4 | Identidade do contato: `leads.instagram_id` (IGSID). `leads.phone` continua `NOT NULL` com o placeholder `ig_<IGSID>` já usado hoje | Tornar `phone` nulo mexe em constraint única, RPCs e dezenas de telas. O placeholder fica e passa a ser tratado explicitamente (nunca exibido, nunca enviado ao WhatsApp) |
| D5 | **Canal de resposta = canal da última mensagem recebida do contato**, com fallback por dado disponível | Contato que começou no Instagram e depois passou telefone continua sendo respondido onde está falando |
| D6 | Inbound passa pelo `lead-inbound-handler` (mesmo caminho do WhatsApp) | Dedup, distribuição, deal, avatar, automações e regras de pipeline por origem de graça, sem terceira cópia da lógica |
| D7 | Janela: 24h livre. Tag `HUMAN_AGENT` (até 7 dias, só humano) fica atrás de uma variável de ambiente desligada por padrão | A tag exige revisão própria da Meta. Ligar antes da aprovação é violação de política |
| D8 | Token de longa duração (60 dias) no Vault, renovado por cron diário | Token não renovado em 60 dias expira e a integração cai calada |
| D9 | Mensagens efêmeras (menção em story, compartilhamento de reel/post) viram texto com rótulo e link, sem baixar a mídia | A URL de CDN expira e o conteúdo é de terceiros. Minimização (LGPD) e sem tipo novo no CHECK de `message_type` |

## 4. Escopo por onda

### Onda 1 (esta Spec): conectar, receber, responder
- Conexão self-service pelo admin (OAuth Instagram Login), status, reconectar e desconectar
- Inscrição automática do webhook da conta
- Inbound: texto, imagem, vídeo, áudio, arquivo, resposta a story, menção em story, compartilhamentos, quick reply e postback como texto, anúncio Click-to-Direct (`ad_context`), mensagem não suportada
- Echo: mensagem que o dono responde pelo app do Instagram aparece no Veltzy, sem duplicar as enviadas pelo próprio Veltzy
- Confirmação de leitura (`messaging_seen`) vira `delivery_status = 'read'`
- Perfil do contato (nome, @, foto) na criação do lead
- Outbound humano: texto, imagem, vídeo, áudio, PDF, com checagem de janela no servidor
- Correção do roteamento de envio (D5) e travas para nunca mandar WhatsApp a um lead `ig_`
- SDR e auto-reply **desligados** para leads do Instagram (trava explícita, até a Onda 2)
- Renovação automática do token, callbacks de desautorização e exclusão de dados exigidos pela Meta
- Exibição: nunca mostrar `ig_...`, mostrar @ e ícone do canal

### Onda 2: automação no canal
- SDR IA (v1 `sdr-ai` e v2 `sdr-engine`), transfer e auto-reply enviando pelo Instagram via um roteador de canal compartilhado
- Reações (exibir e enviar), mensagem apagada pelo contato
- Ice breakers e menu persistente configuráveis
- Tag `HUMAN_AGENT` ligada depois da aprovação da Meta

### Onda 3: comentários e escala
- Webhook de comentários, resposta privada (comentário vira DM e lead)
- Mais de uma conta de Instagram por empresa
- Unificação de contato Instagram + WhatsApp da mesma pessoa

## 5. Requisitos funcionais (Onda 1)

- **RF1** Só `admin` e `super_admin` conectam, reconectam e desconectam. Vendedor e gestor veem o status.
- **RF2** O card só oferece conexão quando a flag `instagram_enabled` da empresa está ligada.
- **RF3** Conectar a mesma conta em uma segunda empresa falha com mensagem clara, sem alterar a primeira.
- **RF4** Toda DM recebida de conta conectada gera ou atualiza o lead pelo `instagram_id` e grava a mensagem uma única vez (dedup por `mid`).
- **RF5** Lead novo do Instagram nasce com origem "Instagram", nome ou @, foto, negócio no pipeline resolvido pelas regras de origem, e é distribuído como os demais.
- **RF6** Resposta do Veltzy chega no Direct do contato e fica com `external_id` = id da Meta e status `sent`, `failed` ou `read`.
- **RF7** Fora da janela permitida o envio é recusado pelo servidor e a tela explica o motivo.
- **RF8** Nenhum caminho de envio de WhatsApp aceita lead cujo telefone é placeholder `ig_`.
- **RF9** Token expirando é renovado sozinho. Token morto aparece no card como "Reconectar" e mensagens de envio falham com motivo.
- **RF10** Desautorizar o app pelo Instagram desativa a conexão e apaga o token.

## 6. Fora de escopo (Onda 1)
Tudo listado nas Ondas 2 e 3, publicação de conteúdo, insights, Facebook Messenger, histórico de conversas anteriores à conexão, fusão de contatos.

## 7. Dependências fora do código (Leticia / Toni, painel da Meta)

Sem isso o código fica pronto e não recebe nada:

1. No app da Meta (existe o `1524724456057574` do Embedded Signup; pode ser o mesmo app), adicionar o produto **Instagram > API setup with Instagram login** e anotar **Instagram App ID** e **Instagram App Secret** (são diferentes do App ID do Facebook).
2. Em Business login settings: **OAuth redirect URI** exata do front de cada ambiente (`https://<host>/integracoes/instagram/callback`), **Deauthorize callback URL** e **Data deletion request URL** apontando para as edge functions novas.
3. Webhooks do produto Instagram: callback `https://<ref>.supabase.co/functions/v1/instagram-webhook`, verify token, e assinar os campos `messages`, `message_echoes`, `messaging_seen`, `messaging_postbacks`, `messaging_referral`, `message_reactions`.
4. Enquanto o app está sem revisão: adicionar a conta de teste do Instagram como **Instagram tester** (Standard Access só funciona para contas com papel no app). Conta precisa ser profissional (Business ou Creator).
5. Para clientes reais: **App Review** com Advanced Access de `instagram_business_basic` e `instagram_business_manage_messages`, verificação do negócio, vídeo do fluxo e política de privacidade publicada. Prazo da Meta, fora do nosso controle: começar em paralelo à Onda 1.
6. Secrets das edge functions no staging (lista na Spec, seção 9).

## 8. LGPD

**Papéis:** a empresa cliente é **controladora** dos dados dos contatos dela. Veltzy (Daxen Labs) é **operadora**. A Meta é controladora independente do que acontece dentro do Instagram.

| Dado | Titular | Base legal (art. 7º LGPD) | Minimização |
|---|---|---|---|
| IGSID, nome, @, foto de perfil | Contato que mandou DM | Procedimentos preliminares a contrato a pedido do titular (V) e legítimo interesse do controlador (IX): a pessoa iniciou a conversa com a empresa | Não coletar `follower_count`, `is_verified_user` e afins. A foto é copiada para o storage porque a URL da Meta expira em dias |
| Conteúdo de mensagens e mídia | Contato | Mesmas bases acima | Menção em story e compartilhamentos não são baixados (D9) |
| Token de acesso da conta | Empresa cliente (pessoa jurídica) | Execução de contrato (V) | Só no Vault, nunca em coluna, nunca no client, nunca em log |
| Id e @ da conta profissional | Empresa cliente | Execução de contrato (V) | Nada além de id, id do app, @ e nome |

- **Compartilhamento com terceiro:** o texto e a mídia que o vendedor envia saem para a Meta. Isso precisa constar na Política de Privacidade e no DPA com o cliente.
- **Consentimento:** não é a base legal aqui, mas a Meta só libera o perfil do contato depois que ele escreveu (consentimento de plataforma). O Veltzy não tenta ler perfil de quem não escreveu.
- **RLS:** `instagram_connections` tem RLS ligado mas nenhuma policy no Central (conferido em 14/09 na baseline do Hub). A migration cria a policy de leitura isolada por tenant. Não há policy de escrita: só edge function com service role grava. Nenhuma coluna exposta é segredo.
- **Retenção e exclusão:** conversas seguem a política existente de leads e mensagens (exclusão do lead apaga mensagens em cascata). Desconexão e desautorização apagam o token do Vault na hora e mantêm a linha com `is_active = false` como registro de que a conexão existiu. **Lacuna registrada:** o segredo do Vault não é apagado na exclusão de empresa (`delete_company_cascade`), item para a Onda 2.
- **Callback de exclusão de dados da Meta:** refere-se à conta profissional que desautorizou o app. Apaga token e dados da conexão. As conversas pertencem ao controlador (a empresa cliente) e não são apagadas por esse callback.
- **Risco herdado:** mídia recebida vai para o bucket `chat-attachments`, que o audit A2 aponta como público. O Instagram não piora nem corrige isso: fica dependente do A2.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| App Review demora ou é negado | Onda 1 validada com tester no staging. Começar a revisão já |
| `entry.id` do webhook diferente do id salvo na conexão | Salvar `user_id` do `/me` (id da conta profissional) e o `user_id` da troca do código. Webhook sem conexão correspondente loga os dois ids |
| Echo da mensagem enviada pelo Veltzy chegando antes do `external_id` ser gravado | Mensagem gravada antes da chamada à Meta e match de echo por conteúdo em janela curta (Spec 5.2) |
| Produção ainda com o código antigo e A7 incompleto | Promoção só depois do A7 fases 1 e 3 em produção. Ordem na Spec, seção 11 |
| Janela de 24h calculada com mensagem de outro canal | Servidor calcula só com mensagens `source = 'instagram'` do contato |

## 10. Perguntas em aberto (não bloqueiam a Onda 1)

1. Qual host do front do staging vai na redirect URI? (Leticia)
2. A Política de Privacidade (`/privacidade`) já cita a Meta como destinatária? Se não, é pré-requisito do App Review.
3. Mesmo app da Meta do Embedded Signup ou app separado para o Instagram? Recomendação: mesmo app, menos revisão duplicada.
