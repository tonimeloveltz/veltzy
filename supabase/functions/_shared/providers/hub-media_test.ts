import { assertEquals } from 'jsr:@std/assert@1'
import { buildHubMedia } from './hub-media.ts'

const url = 'https://x.supabase.co/storage/v1/object/public/chat-attachments/c/l/1795710786367-op-1343.pdf'

Deno.test('documento do inbox leva nome e mimetype, sem legenda repetida', () => {
  assertEquals(
    buildHubMedia({ phone: '55', type: 'document', content: 'op-1343.pdf', mediaUrl: url, fileName: 'op-1343.pdf', mimeType: 'application/pdf' }),
    { type: 'document', url, file_name: 'op-1343.pdf', mimetype: 'application/pdf' },
  )
})

Deno.test('legenda diferente do nome e mantida; campos ausentes nao vao', () => {
  assertEquals(
    buildHubMedia({ phone: '55', type: 'image', content: 'Segue a foto', mediaUrl: url }),
    { type: 'image', url, caption: 'Segue a foto' },
  )
})
