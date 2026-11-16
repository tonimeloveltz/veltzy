// Clientes service_role usados pelas Edge Functions de evento. Os tipos saem do proprio
// createClient (sem gerador de tipos no Veltzy), um para o schema veltzy e um para o public.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const makeVeltzy = (url: string, key: string) => createClient(url, key, { db: { schema: 'veltzy' } })
const makePublic = (url: string, key: string) => createClient(url, key)

export type VeltzyClient = ReturnType<typeof makeVeltzy>
export type PublicClient = ReturnType<typeof makePublic>

export function serviceClients(): { veltzy: VeltzyClient; pub: PublicClient } {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return { veltzy: makeVeltzy(url, key), pub: makePublic(url, key) }
}
