import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { getCorsHeaders } from '../_shared/cors.ts'

// C5: escape de HTML. Toda variavel interpolada no corpo do email passa por aqui
// como defesa em profundidade — o vetor primario ja e fechado derivando os
// valores do banco em vez do body, mas nunca interpolar texto cru em HTML.
const escapeHtml = (v: unknown): string =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAuth = createClient(url, key)
    const supabasePublic = createClient(url, key)

    // C5: so um admin autenticado dispara o email, e o payload nao e confiavel.
    // O body traz apenas invite_id; email/role/token/company_name/quem convidou
    // sao lidos da linha de convite no banco, apos conferir que ela pertence a
    // empresa do admin. Fecha o relay aberto e a injecao de HTML de uma vez.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(jwt)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: profile } = await supabasePublic
      .from('profiles')
      .select('company_id, name')
      .eq('user_id', user.id)
      .single()
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'No company' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: roleRows } = await supabasePublic
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
    const isAdmin = (roleRows ?? []).some(
      (r: { role: string }) => r.role === 'admin' || r.role === 'super_admin',
    )
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { invite_id } = await req.json()
    if (!invite_id) {
      return new Response(JSON.stringify({ error: 'invite_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Convite lido do banco e escopado a empresa do admin: nao da para enviar
    // convite de outra empresa nem controlar destinatario/texto pelo payload.
    const { data: invite } = await supabasePublic
      .from('invitations')
      .select('email, role, token, company_name, company_id, status')
      .eq('id', invite_id)
      .eq('company_id', profile.company_id)
      .single()
    if (!invite) {
      return new Response(JSON.stringify({ error: 'Invite not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (invite.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Invite is not pending' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const email = invite.email
    const role = invite.role
    const token = invite.token
    const company_name = invite.company_name
    const invited_by_name = profile.name

    const brevoKey = Deno.env.get('BREVO_API_KEY')
    if (!brevoKey) {
      console.error('BREVO_API_KEY not set')
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'https://app.veltzy.com'
    const acceptLink = `${appUrl}/aceitar-convite?token=${encodeURIComponent(token)}`
    const acceptLinkAttr = escapeHtml(acceptLink)

    const roleLabels: Record<string, string> = {
      seller: 'Vendedor',
      manager: 'Gestor',
      admin: 'Administrador',
    }
    const roleLabelRaw = roleLabels[role] ?? role
    const roleLabel = escapeHtml(roleLabelRaw)
    const companyNameSafe = escapeHtml(company_name ?? 'uma empresa')
    const invitedBySafe = invited_by_name ? escapeHtml(invited_by_name) : ''

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #ec4899; margin: 0; font-size: 28px;">Veltzy</h1>
          <p style="color: #888; margin-top: 4px;">CRM inteligente para vendas</p>
        </div>

        <h2 style="color: #333;">Voce foi convidado!</h2>

        <p style="color: #555; line-height: 1.6;">
          ${invitedBySafe ? `<strong>${invitedBySafe}</strong> convidou voce` : 'Voce foi convidado'}
          para fazer parte de <strong>${companyNameSafe}</strong> no Veltzy como <strong>${roleLabel}</strong>.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${acceptLinkAttr}"
             style="display: inline-block; background-color: #ec4899; color: white;
                    padding: 14px 32px; border-radius: 8px; text-decoration: none;
                    font-weight: bold; font-size: 16px;">
            Aceitar convite
          </a>
        </div>

        <p style="color: #888; font-size: 13px; line-height: 1.5;">
          Este convite expira em 7 dias. Se voce nao reconhece este convite, ignore este email.
        </p>

        <p style="color: #888; font-size: 12px; margin-top: 8px;">
          Ou copie e cole este link no navegador:<br/>
          <a href="${acceptLinkAttr}" style="color: #ec4899; word-break: break-all;">${acceptLinkAttr}</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #aaa; font-size: 11px; text-align: center;">
          Veltzy - CRM com IA para vendas via WhatsApp
        </p>
      </div>
    `

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Veltzy', email: 'noreply@veltzy.com' },
        to: [{ email }],
        subject: `Convite para ${company_name ?? 'Veltzy'} - ${roleLabelRaw}`,
        htmlContent,
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error('Brevo error:', errorBody)
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: errorBody }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
