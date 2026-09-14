// Primitivas de HMAC-SHA256 e base64url usadas pelo state do OAuth e pelo
// signed_request da Meta (Instagram DM, Onda 1). Sem dependencia externa.
// Nunca logar o segredo nem as assinaturas.

export const base64UrlEncode = (bytes: Uint8Array): string => {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Devolve null para entrada que nao e base64url valido. */
export const base64UrlDecode = (value: string): Uint8Array | null => {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  try {
    const bin = atob(b64)
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

export const hmacSha256 = async (secret: string, data: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
}

/** Comparacao em tempo constante (mesma ideia de meta-signature.ts). */
export const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
