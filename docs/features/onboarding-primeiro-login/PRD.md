# PRD: Onboarding de primeiro login

> Feature: `onboarding-primeiro-login` / Onda 1 (essencial)
> Status: Rascunho, aguardando revisão da Leticia
> Data: 2026-10-19

---

## 1. Problema

Uma empresa nova entra no Veltzy pelo `provision-company` do Hub. O admin recebe o magic link, cai no dashboard e não tem ninguém dizendo o que falta. O dashboard vazio não explica por que nenhum lead aparece, e a resposta ("você ainda não conectou um WhatsApp") mora na aba Admin > Integrações, que a pessoa não sabe que existe.

**O que esta entrega resolve:** no primeiro login, o admin é conduzido até o único passo sem o qual o Veltzy não funciona, e quem pular (ou quem já existia sem esse passo feito) vê um aviso persistente até resolver.

## 2. O que já vem pronto (e por isso NÃO entra no onboarding)

Levantado contra o código e o schema real (baseline do Hub e `provision-company`):

| Item | Como chega pronto |
|---|---|
| Empresa, nome, slug | `provision-company` |
| Nome e senha do admin | `provision-company` recebe `admin_nome` e `senha` |
| Papel admin com `company_id` | `provision-company`, passo 3 (Anexo A da Spec do onboarding unificado) |
| Funil "Pipeline Principal" com 6 etapas | trigger `setup_veltzy_for_company()` |
| Origens WhatsApp, Instagram, Manual | mesmo trigger |
| Regras de negócio e SDR (desligado) | trigger `veltzy.create_default_settings()` |
| Nome e senha do membro convidado | tela `/aceitar-convite` já pede nome completo e senha |
| Disponibilidade do vendedor | `profiles.is_available` nasce `true` |

O que **não** vem pronto e impede o uso: **nenhum número de WhatsApp conectado**. Sem ele não entra lead, não sai mensagem, o inbox e o pipeline ficam vazios.

## 3. Escopo da Onda 1

**Entra:**
1. Wizard de tela cheia `/onboarding`, só para o **admin** de empresa **nova**, com 5 telas: boas-vindas, conectar WhatsApp (com teste opcional de mensagem real), convidar equipe (opcional), importar planilha (opcional) e pronto.
2. "Fazer depois" em todas as telas. Pular não bloqueia nada.
3. Na tela de importação, o admin pode subir uma planilha (.xlsx ou .csv) com os contatos e negócios que já tem. Para isso é reaproveitado o `ImportLeadsModal`, o mesmo de Pipeline, Contatos e Negócios, que já oferece a planilha modelo, o mapeamento de colunas, a checagem de duplicados e a criação de contato e negócio. Essa tela tem o seu próprio "Pular esta etapa", que avança para "Pronto" sem encerrar o onboarding.
4. Aviso "Termine de configurar" no topo da página Admin, para **qualquer** empresa (nova ou antiga) cujo admin ainda não tenha número conectado, com botão que abre a conexão direto.

**Fica fora (ondas futuras, já desenhadas na conversa de 19/10):**
- Trilha do membro convidado (perfil, disponibilidade, número padrão, tour).
- Etapas de marca, revisão do funil, regras de distribuição, IA SDR e produtos.
- Checklist "Configuração N/8" no dashboard.

## 4. Decisões

**D1. Só o essencial: WhatsApp.** O resto ou já vem pronto (seção 2) ou é melhoria, não pré-requisito. A Leticia pediu explicitamente "apenas o que é essencial para a pessoa conseguir usar o Veltzy".

**D2. "Feito" é derivado do dado real.** A etapa de WhatsApp conta como feita quando existe ao menos um número com status `connected` em `useWhatsAppNumbers()`. Não existe flag "whatsapp_ok". Se o número cair depois, o aviso no Admin volta sozinho.

**D3. Flag só para o que não dá pra derivar: pulou ou concluiu.** Guardado em `public.companies.metadata.onboarding` (`{ skipped_at?, completed_at? }`). A coluna `metadata jsonb` já existe no Central e ninguém usa hoje. **Sem migration.** A policy `Admins can update own company` já permite o update.
> Observação: o desenho original falava em `companies.settings`. Essa coluna **não existe** no banco (o tipo `Company` do front declara `settings`, mas o schema real tem `metadata`). Corrigido aqui.

**D4. Empresa nova = criada a partir de 19/10/2026 (`ONBOARDING_CUTOFF`).** Empresas anteriores nunca veem o wizard. Se não tiverem número conectado, veem só o aviso no Admin (pedido da Leticia em 19/10). O corte por data é aceitável aqui porque o wizard ainda exige "nenhum número cadastrado", então uma empresa nova que já conectou por outro caminho também não o vê.

**D5. Não bloqueante.** O wizard redireciona uma vez. Depois de "Fazer depois" ou "Concluir", nunca mais redireciona. Quem precisa do Veltzy sem WhatsApp (ex.: só leads manuais) não fica preso.

**D7. Importar planilha entra, mas opcional (pedido da Leticia em 19/10).** Não é pré-requisito para usar o Veltzy, mas quem chega de outro CRM ou de uma planilha quer ver a própria carteira no funil desde o primeiro dia. A etapa vem **depois** do WhatsApp por um motivo técnico: o import resolve `whatsapp_instance_name` de cada lead na hora de inserir (`resolveWhatsAppInstance`). Com um número já conectado, os contatos importados nascem prontos para receber mensagem. "Feito" aqui não é rastreado: é uma etapa opcional, e o resultado aparece no próprio modal (importados, ignorados e erros).

**D8. Teste de mensagem real na tela do WhatsApp (19/10).** Status `connected` prova que o número está pareado, não que a mensagem chega ao Veltzy: no meio estão o webhook do Hub e o roteamento para o funil, e os dois já falharam em silêncio no staging. Depois de conectar, a tela pede um "oi" de outro celular e mostra o lead quando ele aparece (polling de 3s em `leads` da empresa). É opcional e não trava o `Continuar`. É também o primeiro momento em que a pessoa vê o produto funcionando.

**D9. Convidar equipe, antes da importação (19/10).** Sem vendedores, todo lead cai no admin pelo fallback, e o round-robin não tem para quem distribuir. A tela reaproveita o `InviteMemberModal`, que já checa o teto do plano. Vem antes da importação porque a coluna "Responsável" da planilha só consegue atribuir a membros. **Limite conhecido:** o convidado só vira membro quando aceita, então quem acabou de ser convidado ainda não é reconhecido no import. A tela de importação avisa isso, e os contatos ficam com o admin para redistribuir depois.

**D6. Super admin nunca vê o wizard.** Nem o redirecionamento quando estiver impersonando. O aviso no Admin aparece para ele, porque é informação útil para o suporte.

## 5. LGPD

- **Dados tratados nesta onda:** nenhum dado pessoal novo é coletado pelo onboarding. Ele só grava datas (`skipped_at`, `completed_at`) em `companies.metadata`.
- **Ponto de atenção herdado:** a conexão pela API Oficial em modo coexistence pode importar até 180 dias de histórico de conversas do número (ver `070_messages_is_history.sql`). A base legal é a execução de contrato com a empresa cliente, que é a controladora dessas conversas. O consentimento para compartilhar o histórico é dado pela empresa na tela da Meta durante o embedded signup. A tela 2 do wizard exibe uma linha informando que o histórico pode ser importado, para que o admin decida sabendo disso.
- **Importação de planilha:** os dados pessoais de terceiros (nome, telefone, e-mail dos contatos do cliente) entram pelo mesmo caminho que já existe em Contatos, sem dado novo nem tabela nova. A empresa cliente é a controladora e responde pela base legal da própria carteira. O Veltzy é operador. A tela de importação mostra uma linha lembrando isso: `Importe apenas contatos com quem sua empresa já tem relação ou autorização para falar.`
- **RLS:** sem tabela nova. O update em `companies` passa pela policy existente (`id = get_current_company_id() AND is_company_admin()` ou super admin). A Spec confere que o update volta 1 linha.

## 6. Métrica de sucesso

- % de empresas criadas após o corte com número `connected` em até 24h do primeiro login.
- Conferível por SQL de leitura (a rodar pela Leticia): empresas com `created_at >= cutoff` e `metadata->'onboarding'` preenchido, cruzadas com números conectados.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Nenhuma categoria de WhatsApp liberada no Hub para a empresa | `WhatsAppNumbersList` já mostra "Nenhum canal de WhatsApp liberado. Fale com o suporte." O wizard herda isso e deixa "Fazer depois" disponível |
| Dialog de conexão da Evolution e da API Oficial não invalidam `['whatsapp-numbers']` | A tela 2 faz polling de 5s enquanto está aberta. Não mexe nos dialogs |
| Update em `metadata` sobrescrever chaves de outro dono | Merge no client: lê `metadata` fresco, espalha, grava. Hoje ninguém mais usa a coluna |
| A criação dos negócios no import é best-effort: se o insert em `deals` falhar, só faz `console.error`, e o modal informa os contatos como importados (`createDealsForImportedLeads`) | Comportamento herdado, já vale hoje em Contatos e Negócios. Fica registrado como achado fora de escopo na Spec. No PVO, conferir que os negócios aparecem no Pipeline depois do import |
| Redirecionamento com flash de loader para todo login | O gate só consulta números quando as checagens baratas (papel, data, flag) já indicaram empresa nova sem flag |
