// IP do inscrito: nunca gravado cru (LGPD). So o sha256 com sal, e expurgado em 90 dias.

/** Primeiro item de x-forwarded-for, senao cf-connecting-ip, senao 'unknown'. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return forwarded
  const cf = headers.get('cf-connecting-ip')?.trim()
  return cf || 'unknown'
}

/** sha256 hex de `salt:ip`. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
