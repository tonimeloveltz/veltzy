# Contexto de Ambientes — VELTZY

> Referência de ambientes deste repo. Consultar no início de qualquer tarefa que
> toque **banco**, **edge functions** ou **secrets**. Descreve o estado ATUAL
> (staging compartilhado; local ainda não existe). Será atualizado quando o
> ambiente local (Docker) for montado.
>
> Fonte: `contexto-ambientes-VELTZY.md` (salvo aqui em 2026-07-09).

## Como os ambientes funcionam agora

O ecossistema Veltz usa **dois** bancos Supabase, ambos na mesma org paga:

- **Produção** — ref `zxefzegggntfjlfsdgvw` (Central compartilhado por Hub,
  Veltzy, Leadbaze e Lemya). NUNCA é alvo de escrita durante desenvolvimento.
- **Staging** — ref `hfebvugdsztnzgpybdwj` (`veltz-group-staging`, mesma
  região us-east-1, espelho do schema de produção). É onde todo o
  desenvolvimento e teste acontece.

Ainda NÃO existe banco local (Docker). Isso será adicionado depois. Por
enquanto, dev e develop apontam para o **staging**.

## Papel do Veltzy neste esquema

O Veltzy **consome** o schema do Central, não é dono dele. Quem é dono do
schema é o Hub. Consequência prática:

- O Veltzy NÃO cria migrations para o Central. Se o Veltzy precisar de uma
  mudança de schema (nova tabela, coluna, etc), isso é feito como migration
  no repo do **Hub**, não aqui.
- O Veltzy tem Edge Functions próprias (em `supabase/functions/`). Essas SIM
  são deployadas a partir deste repo, para o projeto de staging.

## Estado atual no staging

- Schema do Central: espelhado (as 100 tabelas, incluindo o schema `veltzy`).
- Secrets no staging: os do que já roda em produção hoje (Meta, OpenAI,
  Brevo, Evolution, `HUB_WEBHOOK_SECRET`, `JWT_SECRET`).
- Edge Functions: as 24 do repo foram deployadas no staging.
- Features ainda NÃO em produção (Instagram, ai-copilot/Anthropic, conexão
  HUB_* explícita) NÃO tiveram secrets configurados no staging. Quando forem
  para produção, configuraremos os secrets correspondentes no staging junto.

## Regras de segurança (guard-rails)

- **Produção é READ-ONLY em desenvolvimento.** Nunca `db push`/`db pull`/
  `migration repair` apontando para o Central de produção.
- **Antes de qualquer deploy de function ou `secrets set`**, confirmar com
  `supabase projects list` que o `●` está no **staging**
  (`hfebvugdsztnzgpybdwj`), NUNCA na produção. (A pasta do Veltzy já esteve
  linkada em produção; sempre checar antes de escrever.)
- Connection strings e valores de secret NUNCA inline no comando.
- Nenhuma PII de cliente vai para staging.
- **Código e banco são trilhos separados.** Merge no git deploya código na
  Vercel, mas NÃO empurra migration para produção. Migration em produção é
  sempre `db push` manual e consciente, com o link confirmado no projeto de
  produção só naquele momento.

## Ponto de atenção conhecido (config.toml)

Existe uma entrada fantasma `[functions.evolution-send-message]` (linhas
384-385 do `config.toml`) apontando para uma function que na verdade vive no
Hub, não neste repo. Enquanto ela existir, `supabase functions deploy` sem
argumentos ABORTA nesse ponto. Alternativas: remover as linhas 384-385, ou
deployar functions por nome. (Item pendente — Bloco 5.)

## Onde apontam as variáveis

- **Local** (`.env.local`): staging (`hfebvugdsztnzgpybdwj`). Só
  `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` mudam entre ambientes.
- **Vercel Preview**: staging.
- **Vercel Production**: produção.

Observação: `VITE_HUB_SUPABASE_URL` é variável MORTA (nenhum código lê). O
Hub é acessado só server-side pelas Edge Functions, via secret `HUB_SUPABASE_URL`
(sem prefixo `VITE_`), não pelo frontend.
