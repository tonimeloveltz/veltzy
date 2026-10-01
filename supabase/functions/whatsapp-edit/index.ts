import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getActiveProvider } from '../_shared/whatsapp-config.ts'
import { createProvider } from '../_shared/whatsapp-factory.ts'
import { getCorsHeaders } from '../_shared/cors.ts'
import type { WhatsAppConfig, WhatsAppProviderType } from '../_shared/whatsapp-provider.ts'

// Limite do WhatsApp, nao nosso: passou disso o proprio aparelho ignora a edicao.
const EDIT_WINDOW_MS = 15 * 60 * 1000

interface EditPayload {
  messageId: string
  content: string
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Erros em pt-BR e frase pronta: e esse texto que o vendedor le no toast.
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: jsonHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return bad(401, 'Nao autorizado')

    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAuth = createClient(url, key)
    const supabase = createClient(url, key, { db: { schema: 'veltzy' } })
    const supabasePublic = createClient(url, key)

    // So JWT de usuario. Sem ramo service_role: nada interno edita mensagem.
    const token = authHeader.replace('Bearer ', '')
    if (token === key) return bad(401, 'Nao autorizado')

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !user) return bad(401, 'Sessao invalida')

    const { data: profile } = await supabasePublic
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single()

    if (!profile?.company_id) return bad(400, 'Usuario sem empresa vinculada')
    const companyId: string = profile.company_id

    const payload: EditPayload = await req.json()
    const content = (payload.content ?? '').trim()
    if (!payload.messageId) return bad(400, 'Mensagem nao informada')
    if (!content) return bad(400, 'Mensagem vazia')

    const { data: message } = await supabase
      .from('messages')
      .select('id, lead_id, company_id, content, original_content, external_id, sender_type, message_type, created_at, instance_name, whatsapp_provider, delivery_status')
      .eq('id', payload.messageId)
      .single()

    if (!message || message.company_id !== companyId) return bad(404, 'Mensagem nao encontrada')
    if (message.sender_type === 'lead') return bad(400, 'So da para editar mensagens que voce enviou')
    if (message.message_type !== 'text') return bad(400, 'So da para editar mensagens de texto')
    if (message.delivery_status === 'failed') return bad(400, 'Esta mensagem nao chegou a ser enviada')
    if (!message.external_id) return bad(400, 'Esta mensagem foi enviada antes do suporte a edicao')
    if (Date.now() - new Date(message.created_at).getTime() > EDIT_WINDOW_MS) {
      return bad(400, 'O WhatsApp so permite editar ate 15 minutos depois do envio')
    }
    if (content === message.content) return bad(400, 'O texto nao mudou')

    const { data: lead } = await supabase
      .from('leads')
      .select('phone, whatsapp_instance_name, whatsapp_provider')
      .eq('id', message.lead_id)
      .single()

    if (!lead) return bad(404, 'Conversa nao encontrada')

    const provider = (message.whatsapp_provider ?? lead.whatsapp_provider
      ?? await getActiveProvider(supabasePublic, companyId)) as WhatsAppProviderType

    if (provider !== 'evolution' && provider !== 'waha') {
      return bad(400, 'O WhatsApp deste lead nao permite editar mensagens enviadas')
    }

    // A edicao sai pela MESMA instancia do envio. Sem resolveInstanceName aqui:
    // recalcular a cadeia poderia escolher outro numero.
    const instanceName = message.instance_name ?? lead.whatsapp_instance_name
    if (!instanceName) return bad(400, 'Nao foi possivel identificar o numero que enviou a mensagem')

    // Falhou no provider: NAO grava. O banco tem que refletir o aparelho do lead;
    // editar so no banco cria uma mentira silenciosa.
    try {
      const impl = createProvider(provider)
      if (!impl.editMessage) return bad(400, 'O WhatsApp deste lead nao permite editar mensagens enviadas')

      await impl.editMessage({} as WhatsAppConfig, {
        phone: lead.phone,
        externalId: message.external_id,
        content,
        companyId,
        ...(provider === 'waha' ? { sessionName: instanceName } : { instanceName }),
      })
    } catch (err) {
      console.error('[whatsapp-edit] edit failed:', err)
      return bad(502, 'O WhatsApp recusou a edicao. A mensagem continua como estava.')
    }

    const { data: updated, error: updateError } = await supabase
      .from('messages')
      .update({
        content,
        edited_at: new Date().toISOString(),
        // COALESCE no codigo: na 2a edicao original_content ja existe e nao muda,
        // entao ele e sempre o PRIMEIRO texto, nao a versao anterior.
        original_content: message.original_content ?? message.content,
      })
      .eq('id', message.id)
      .eq('company_id', companyId)
      .select()
      .single()

    if (updateError || !updated) {
      console.error('[whatsapp-edit] update failed:', updateError)
      return bad(500, 'A mensagem foi editada no WhatsApp, mas nao no Veltzy. Recarregue a conversa.')
    }

    return new Response(JSON.stringify(updated), { headers: jsonHeaders })
  } catch (err) {
    console.error('[whatsapp-edit] Error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: jsonHeaders })
  }
})
