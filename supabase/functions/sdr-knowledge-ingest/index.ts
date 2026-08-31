/**
 * sdr-knowledge-ingest — Processa upload de documento para knowledge base.
 * Fluxo: storage → extracao → chunking → embeddings (Hub) → insert pgvector → status update.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractText } from './extractor.ts'
import { chunkText } from './chunker.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMBEDDING_BATCH_SIZE = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey, { db: { schema: 'veltzy' } })
  const supabaseAuth = createClient(supabaseUrl, supabaseKey)
  const supabasePublic = createClient(supabaseUrl, supabaseKey)

  let agentProfileId: string | null = null

  try {
    // A1: exige JWT de usuario. company vem do perfil, nunca do body.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401)
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !user) {
      return jsonResponse({ ok: false, error: 'Invalid token' }, 401)
    }
    const { data: authProfile } = await supabasePublic
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single()
    if (!authProfile?.company_id) {
      return jsonResponse({ ok: false, error: 'No company' }, 403)
    }
    const companyId = authProfile.company_id

    const body = await req.json()
    // A1 (SSRF): recebe o PATH no bucket, nao uma URL. Sem fetch de URL arbitraria.
    const { agentProfileId: apId, filePath, fileName, fileMimeType } = body
    agentProfileId = apId

    if (!agentProfileId || !filePath || !fileName || !fileMimeType) {
      return jsonResponse({ ok: false, error: 'agentProfileId, filePath, fileName e fileMimeType obrigatorios' }, 400)
    }

    // path tem que morar na pasta da propria empresa (mesma regra da RLS do
    // bucket: (storage.foldername(name))[1] = company_id). Bloqueia traversal.
    if (filePath.includes('..') || !filePath.startsWith(`${companyId}/`)) {
      return jsonResponse({ ok: false, error: 'filePath invalido' }, 403)
    }

    // agent_profile tem que ser da empresa do usuario, senao nao ha o que
    // processar (e evita sobrescrever o status/knowledge de outro tenant).
    const { data: targetProfile } = await supabase
      .from('agent_profiles')
      .select('id')
      .eq('id', agentProfileId)
      .eq('company_id', companyId)
      .single()
    if (!targetProfile) {
      return jsonResponse({ ok: false, error: 'Agent profile nao encontrado' }, 404)
    }

    // 1. Marcar status = processing
    await supabase
      .from('agent_profiles')
      .update({ knowledge_base_status: 'processing' })
      .eq('id', agentProfileId)
      .eq('company_id', companyId)

    console.log(`[sdr-knowledge-ingest] Processing ${fileName} for profile ${agentProfileId}`)

    // 2. Baixar arquivo direto do Storage (service role, bucket privado). O path
    // ja foi validado como pertencente a empresa — nao ha URL externa envolvida.
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('agent-knowledge')
      .download(filePath)
    if (downloadError || !fileBlob) {
      throw new Error(`Falha ao baixar arquivo: ${downloadError?.message ?? 'nao encontrado'}`)
    }
    const fileBuffer = await fileBlob.arrayBuffer()

    // 3. Extrair texto
    const rawText = await extractText(fileBuffer, fileMimeType, fileName)
    if (!rawText.trim()) {
      throw new Error('Documento vazio ou sem texto extraivel')
    }

    console.log(`[sdr-knowledge-ingest] Extracted ${rawText.length} chars from ${fileName}`)

    // 4. Chunking
    const chunks = chunkText(rawText)
    if (chunks.length === 0) {
      throw new Error('Nenhum chunk gerado apos processamento')
    }

    console.log(`[sdr-knowledge-ingest] Generated ${chunks.length} chunks`)

    // 5. Gerar embeddings em batches via Hub /ai-embeddings
    const allEmbeddings: number[][] = []

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE)
      const texts = batch.map((c) => c.content)

      const embResponse = await fetch(`${supabaseUrl}/functions/v1/ai-embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_id: companyId,
          product: 'veltzy',
          feature: 'sdr-knowledge-ingest',
          input: texts,
        }),
      })

      const embResult = await embResponse.json()
      if (!embResult.ok || !embResult.data?.embeddings) {
        throw new Error(`Falha ao gerar embeddings (batch ${i / EMBEDDING_BATCH_SIZE + 1}): ${embResult.error?.message ?? 'unknown'}`)
      }

      allEmbeddings.push(...embResult.data.embeddings)
    }

    // 6. Buscar versao atual e incrementar
    const { data: profile } = await supabase
      .from('agent_profiles')
      .select('knowledge_base_version')
      .eq('id', agentProfileId)
      .single()

    const newVersion = (profile?.knowledge_base_version ?? 0) + 1

    // 7. Inserir chunks com embeddings
    const rows = chunks.map((chunk, idx) => ({
      agent_profile_id: agentProfileId,
      company_id: companyId,
      source_file_name: fileName,
      source_file_url: filePath,
      chunk_index: chunk.index,
      content: chunk.content,
      embedding: `[${allEmbeddings[idx].join(',')}]`,
      metadata: chunk.metadata,
      knowledge_base_version: newVersion,
    }))

    // Inserir em batches para nao estourar payload
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      const { error: insertError } = await supabase
        .from('agent_knowledge_chunks')
        .insert(batch)

      if (insertError) {
        throw new Error(`Falha ao inserir chunks (batch ${i / 50 + 1}): ${insertError.message}`)
      }
    }

    // 8. Atualizar agent_profile: versao e status
    await supabase
      .from('agent_profiles')
      .update({
        knowledge_base_version: newVersion,
        knowledge_base_status: 'ready',
      })
      .eq('id', agentProfileId)

    console.log(`[sdr-knowledge-ingest] Done: ${chunks.length} chunks, version ${newVersion}`)

    return jsonResponse({
      ok: true,
      chunksCreated: chunks.length,
      version: newVersion,
    })
  } catch (err) {
    console.error('[sdr-knowledge-ingest] Error:', err)

    // Marcar status = error
    if (agentProfileId) {
      try {
        await supabase
          .from('agent_profiles')
          .update({ knowledge_base_status: 'error' })
          .eq('id', agentProfileId)
      } catch { /* best-effort */ }
    }

    return jsonResponse({
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao processar documento',
    }, 500)
  }
})

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
