/**
 * Validacao da assinatura x-hub-signature-256 da Meta Cloud API.
 *
 * A Meta assina cada POST com HMAC-SHA256 do corpo CRU usando o App Secret,
 * no formato "sha256=<hex>". O corpo precisa ser lido cru (req.text()) antes
 * de qualquer JSON.parse, senao o HMAC nao bate.
 */

/**
 * Retorna true se a assinatura confere com HMAC-SHA256(rawBody, appSecret).
 * Comparacao em tempo constante. Nunca logar o appSecret nem a assinatura.
 */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const received = signatureHeader.slice('sha256='.length)

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = [...new Uint8Array(sigBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return timingSafeEqual(received, expected)
}

/** Comparacao de strings hex em tempo constante (evita timing attack). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
