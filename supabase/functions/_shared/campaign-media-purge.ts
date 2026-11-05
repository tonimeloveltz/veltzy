// Expurgo do anexo de campanha (campanhas-layout-midia). Chamado como passo (4) do
// process-blast-followups (cron 5 min). Apaga o arquivo do bucket e marca media_purged_at;
// media_url fica (o inbox já mostra "indisponível" quando o arquivo some).
// deno-lint-ignore-file no-explicit-any

export const MEDIA_RETENTION_DAYS = 30
export const PURGE_BATCH = 50
const MEDIA_BUCKET = 'chat-attachments'
const DAY_MS = 86_400_000
const ENDED = ['completed', 'failed', 'cancelled']

export interface PurgeCandidate {
  id: string
  status: string
  media_path: string | null
  media_purged_at: string | null
  completed_at: string | null
  updated_at: string
  created_at: string
}

/** Terminada há mais de 30 dias, ou rascunho criado há mais de 30 dias. */
export const isPurgeDue = (c: PurgeCandidate, now: Date): boolean => {
  if (!c.media_path || c.media_purged_at) return false
  const cutoff = now.getTime() - MEDIA_RETENTION_DAYS * DAY_MS
  if (ENDED.includes(c.status)) return new Date(c.completed_at ?? c.updated_at).getTime() < cutoff
  if (c.status === 'draft') return new Date(c.created_at).getTime() < cutoff
  return false
}

/** veltzy = client do schema veltzy; storage = client com acesso ao bucket (service role). */
export async function purgeCampaignMedia(veltzy: any, storage: any, now: Date): Promise<number> {
  const cutoffIso = new Date(now.getTime() - MEDIA_RETENTION_DAYS * DAY_MS).toISOString()
  // Pré-filtro no banco (índice parcial media_alive); a regra fina fica em isPurgeDue.
  const { data, error } = await veltzy
    .from('blast_campaigns')
    .select('id, status, media_path, media_purged_at, completed_at, updated_at, created_at')
    .not('media_path', 'is', null)
    .is('media_purged_at', null)
    .in('status', [...ENDED, 'draft'])
    .lt('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(PURGE_BATCH * 4)
  if (error) {
    console.error('[campaign-media-purge] select:', error.message)
    return 0
  }

  const due = ((data ?? []) as PurgeCandidate[]).filter((c) => isPurgeDue(c, now)).slice(0, PURGE_BATCH)
  let purged = 0
  for (const c of due) {
    const { error: rmErr } = await storage.storage.from(MEDIA_BUCKET).remove([c.media_path])
    if (rmErr) {
      console.warn(`[campaign-media-purge] remove ${c.media_path}: ${rmErr.message}`)
      continue
    }
    await veltzy.from('blast_campaigns').update({ media_purged_at: now.toISOString() }).eq('id', c.id)
    purged++
  }
  return purged
}
