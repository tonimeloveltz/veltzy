import { assertEquals } from 'jsr:@std/assert@1'
import { INSTAGRAM_ALLOWED_MIME_TYPES, isInstagramMimeAllowed } from './instagram-attachment.ts'
// O espelho do front nao tem import nenhum, entao o Deno consegue ler direto.
import { INSTAGRAM_ALLOWED_MIME_TYPES as FRONT_ALLOWED_MIME_TYPES } from '../../../src/lib/instagram-attachment.ts'

Deno.test('allowlist: todo mime listado e aceito no proprio tipo', () => {
  for (const [type, mimes] of Object.entries(INSTAGRAM_ALLOWED_MIME_TYPES)) {
    for (const mime of mimes) {
      assertEquals(isInstagramMimeAllowed(type as keyof typeof INSTAGRAM_ALLOWED_MIME_TYPES, mime), true)
    }
  }
})

Deno.test('allowlist: audio/webm do gravador e recusado', () => {
  assertEquals(isInstagramMimeAllowed('audio', 'audio/webm'), false)
  assertEquals(isInstagramMimeAllowed('audio', 'audio/ogg'), false)
})

Deno.test('allowlist: imagem so png e jpeg, documento so pdf', () => {
  assertEquals(isInstagramMimeAllowed('image', 'image/webp'), false)
  assertEquals(isInstagramMimeAllowed('image', 'image/gif'), false)
  assertEquals(isInstagramMimeAllowed('document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), false)
})

Deno.test('allowlist: mime de outro tipo, vazio ou nulo e recusado', () => {
  assertEquals(isInstagramMimeAllowed('image', 'application/pdf'), false)
  assertEquals(isInstagramMimeAllowed('video', ''), false)
  assertEquals(isInstagramMimeAllowed('document', null), false)
})

Deno.test('allowlist: normaliza caixa e parametros', () => {
  assertEquals(isInstagramMimeAllowed('audio', 'Audio/MP4; codecs=mp4a.40.2'), true)
})

Deno.test('allowlist: servidor e front usam a mesma lista', () => {
  assertEquals(FRONT_ALLOWED_MIME_TYPES, INSTAGRAM_ALLOWED_MIME_TYPES)
})
