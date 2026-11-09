Trilha: M
Início: 2026-11-09 16:45
Merge: (preencher no merge)

# Áudio do inbox chega quebrado no WhatsApp

## Problema
Áudio gravado no inbox chega no celular do contato como bolha de voz com "Não foi possível baixar o áudio".

## Causa raiz
- `audio-recorder.tsx` gravava com `MediaRecorder` forçando `audio/webm` e subia `.webm`.
- Hub `waha-send-message` mandava qualquer áudio para `/api/sendVoice` só com a URL.
- Mensagem de voz do WhatsApp só toca OGG/Opus. O WAHA em uso é o Core (`devlikeapro/waha:noweb`), sem a conversão do Plus. O envio é aceito (`delivery_status = sent`), mas o arquivo não toca.
- Evidência: mensagem de 2026-11-09 19:39 UTC, `file_mime_type = audio/webm`, provider `waha`, sessão `veltz-group`.

## Correção
1. **Veltzy:** gravar direto em OGG/Opus no navegador com `opus-recorder` (encoder WASM em worker, igual em Chrome, Safari e Firefox). Upload `.ogg` com `contentType audio/ogg`. Vale para inbox e anexo de áudio de campanha (mesmo componente).
2. **Veltzy UX:** botão de encerrar a gravação vira "Parar" (ícone quadrado) em vez de "Enviar"; estado "Finalizando gravação…" entre parar e a prévia; erro de início distingue permissão negada, sem microfone e falha genérica.
3. **Hub:** `waha-send-message` escolhe endpoint e mimetype em `media.ts`: áudio `.ogg/.opus/.oga` vai como voz com `audio/ogg; codecs=opus`; outro áudio vai como arquivo (`/api/sendFile`) com mimetype e nome, para não gerar bolha de voz quebrada.

<!-- arquivos -->
- veltzy: package.json, package-lock.json
- veltzy: src/types/opus-recorder.d.ts
- veltzy: src/hooks/use-voice-recorder.ts
- veltzy: src/components/inbox/audio-recorder.tsx
- veltzy: specs/audio-voz-whatsapp/SPEC.md
- hub: supabase/functions/waha-send-message/index.ts
- hub: supabase/functions/waha-send-message/media.ts
- hub: supabase/functions/waha-send-message/media_test.ts
<!-- /arquivos -->

## Ordem
Independentes. Veltzy sozinho já resolve áudio gravado (OGG passa a tocar como voz). Hub cobre áudio não OGG anexado manualmente.

## Decisões tomadas
- Codificar no navegador em vez de converter no servidor: Edge Function não tem ffmpeg e o WAHA Core não converte.
- `opus-recorder` 8.0.5 (MIT): padrão de mercado para OGG/Opus no browser; worker com WASM embutido (~385 KB, carregado só ao gravar).
- Perfil de voz do Opus (2048), mono, 48 kHz: menor arquivo, mesma configuração da voz do WhatsApp.
- Áudio não OGG vai como arquivo e não como voz: aparece como anexo tocável em vez de bolha quebrada.
- Áudios antigos já enviados em webm não são reprocessados.
- Prévia no Safari antigo pode não tocar OGG no player local; o envio funciona igual.
