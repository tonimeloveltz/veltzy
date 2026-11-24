import { assertEquals } from 'jsr:@std/assert@1'
import { assetUrl, confirmUrl, registrationUrl, withAssetUrls } from './public-urls.ts'

Deno.test('urls publicas da inscricao', () => {
  assertEquals(registrationUrl('workshop-ia', 'tok_1', 'https://app.veltzy.com/'), 'https://app.veltzy.com/e/workshop-ia/i/tok_1')
  assertEquals(confirmUrl('workshop-ia', 'tok_1', 'https://app.veltzy.com'), 'https://app.veltzy.com/e/workshop-ia/i/tok_1?confirmar=1')
})

Deno.test('assetUrl e withAssetUrls', () => {
  const base = 'https://x.supabase.co'
  assertEquals(assetUrl(null, base), null)
  assertEquals(assetUrl('c1/e1/logo.png', base), 'https://x.supabase.co/storage/v1/object/public/event-assets/c1/e1/logo.png')
  const a = withAssetUrls({ logo_path: null, banner_path: null, theme: 'light' })
  assertEquals(a.logo_url, null)
  assertEquals(a.theme, 'light')
})
