// Leitura/escrita de segredo via Vault, atraves dos wrappers SECURITY DEFINER
// public.ai_secret_upsert/ai_secret_read (Central, migration 20260804151000).
// EXECUTE so no service_role — o schema vault nao e exposto pelo PostgREST.
// Os edge functions do Veltzy chamam via rpc num client de schema public
// (service_role). Nunca logar o valor do segredo. (A7)
interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export async function guardarSegredo(admin: RpcClient, secretName: string, value: string): Promise<void> {
  const { error } = await admin.rpc('ai_secret_upsert', { p_name: secretName, p_value: value })
  if (error) throw new Error(`Falha ao guardar segredo (${secretName}): ${error.message}`)
}

export async function lerSegredo(admin: RpcClient, secretName: string): Promise<string | null> {
  const { data, error } = await admin.rpc('ai_secret_read', { p_name: secretName })
  if (error) throw new Error(`Falha ao ler segredo (${secretName}): ${error.message}`)
  return typeof data === 'string' && data.length > 0 ? data : null
}

// Nome canonico do access_token do Instagram por empresa (uma conexao por
// company: instagram_connections tem onConflict company_id).
export const instagramTokenSecretName = (companyId: string): string =>
  `instagram_connections.access_token.${companyId}`
