/**
 * Sanitiza o nome de um arquivo para uso como segmento de key do Supabase Storage.
 *
 * O Storage rejeita keys com caracteres nao-ASCII (acento, cedilha) e afins com
 * "Invalid key". Esta funcao normaliza o nome para ASCII seguro preservando a
 * extensao. Use APENAS no segmento do filename da key, nunca nos UUIDs do path.
 *
 * O nome original (com acento) deve continuar sendo guardado separadamente para
 * exibicao (ex: messages.file_name); isto aqui e so a key fisica do objeto.
 *
 * NFD decompoe "a" acentuado em "a" + marca combinante; o filtro remove tudo fora
 * do ASCII imprimivel (incl. a marca combinante), sobrando o "a" puro.
 *
 * Ex: "Catalogo compressed.PDF" (com acento no a) -> "Catalogo_compressed.PDF"
 */
export function safeStorageName(name: string): string {
  const toAscii = (s: string) =>
    s.normalize('NFD').replace(/[^ -~]/g, '')

  const dot = name.lastIndexOf('.')
  const rawBase = dot > 0 ? name.slice(0, dot) : name
  const rawExt = dot > 0 ? name.slice(dot) : ''

  const base = toAscii(rawBase)
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'arquivo'

  const ext = toAscii(rawExt).replace(/[^a-zA-Z0-9.]+/g, '')

  return `${base}${ext}`
}
