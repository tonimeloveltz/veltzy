Trilha: G
Início: 2026-11-26 19:40
Merge: (preencher no merge)

# SPEC: documento com nome e mimetype (lado Veltzy)

PRD, causa raiz e contrato: Hub `specs/envio-documento-mimetype/` (PR hub#290). Ordem: Hub primeiro; este PR depende dele só para o nome original com acento (o Hub já deduz nome e tipo pela URL).

## O que muda
- `whatsapp-send` repassa `mimeType` (já recebido do inbox) aos providers.
- `evolution-hub` e `waha-hub` mandam ao Hub `media.file_name` e `media.mimetype` via `buildHubMedia`.
- Legenda igual ao nome do arquivo deixa de ir (o inbox manda `content = file.name`).

<!-- arquivos -->
- supabase/functions/_shared/whatsapp-provider.ts
- supabase/functions/_shared/providers/hub-media.ts
- supabase/functions/_shared/providers/hub-media_test.ts
- supabase/functions/_shared/providers/evolution-hub.ts
- supabase/functions/_shared/providers/waha-hub.ts
- supabase/functions/whatsapp-send/index.ts
- specs/envio-documento-mimetype/SPEC.md
<!-- /arquivos -->

## Decisões tomadas
- Legenda omitida também em imagem/vídeo quando é só o nome do arquivo: era o mesmo texto automático, sem valor para o contato.
- O texto gravado em `veltzy.messages.content` não muda (inbox segue mostrando o nome).
- Cloud API e Z-API intocados: Z-API já manda `fileName`; Cloud API tem fluxo próprio.

## Verificação
- `deno test supabase/functions/_shared/providers/` verde; `deno check` de `whatsapp-send` limpo.
- Staging, depois do merge dos dois PRs: PDF pelo inbox num número Evolution abre no iPhone com nome `op-1343.pdf`.
