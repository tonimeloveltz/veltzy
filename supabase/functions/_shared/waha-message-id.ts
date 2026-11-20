// Id de mensagem WAHA (NOWEB) em formato único para o dedupe por messages.external_id.
// O receiver do Hub encaminha _data.key.id cru ("2A2220A84D1C32411DE0"); o envio
// (waha-send-message) pode devolver o id serializado ("true_5511...@c.us_3EB0...").
// Normaliza os dois para o segmento final após o último "_".
export function normalizeWahaMessageId(id: string | null | undefined): string | null {
  const raw = (id ?? '').trim()
  if (!raw) return null
  const tail = raw.includes('_') ? raw.slice(raw.lastIndexOf('_') + 1) : raw
  return tail || null
}
