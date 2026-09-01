/**
 * A5 — trava as funcoes de cron (distribute-queue, process-message-queue,
 * check-sla, send-task-reminders, check-whatsapp-health), que rodam com
 * service_role e antes eram invocaveis por qualquer um (verify_jwt = false).
 *
 * Aceita dois segredos, e basta um:
 *   - x-cron-secret == CRON_SECRET (segredo dedicado do trigger de cron), ou
 *   - Authorization: Bearer <service_role_key> (segredo do projeto; e o que um
 *     scheduler do Supabase costuma mandar para funcao de service).
 * A anon key NAO passa (nao e igual a nenhum dos dois). Sem segredo, 401.
 */
export function isCronAuthorized(req: Request): boolean {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const bearer = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (serviceKey && bearer && bearer === serviceKey) return true

  const cronSecret = Deno.env.get('CRON_SECRET')
  const provided = req.headers.get('x-cron-secret')
  if (cronSecret && provided && provided === cronSecret) return true

  return false
}

export function cronUnauthorized(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
