# Deploy - Veltzy CRM

## Pre-requisitos

- Node.js 20+
- Conta Supabase (projeto criado)
- Conta Netlify
- Repositorio GitHub (privado)

## 1. Supabase

### Migrations
Este repo não aplica migration. O banco é o Central, compartilhado com o Hub, e as
migrations dele moram em `hub/supabase/migrations/`. O legado daqui foi para
`docs/legado/migrations-veltzy/` e não está no histórico do banco.

### Deploy Edge Functions
```bash
npx supabase functions deploy zapi-webhook
npx supabase functions deploy zapi-send
npx supabase functions deploy whatsapp-manager
npx supabase functions deploy sdr-ai
npx supabase functions deploy run-automations
npx supabase functions deploy distribute-queue
npx supabase functions deploy source-webhook
npx supabase functions deploy instagram-oauth
npx supabase functions deploy instagram-webhook
npx supabase functions deploy instagram-send
```

### Configurar Secrets
Dashboard > Settings > Edge Functions > Secrets:
- `OPENAI_API_KEY` (opcional)
- `GEMINI_API_KEY` (opcional)
- `RESEND_API_KEY` (para emails de convite)

### Configurar Auth
Dashboard > Authentication > URL Configuration:
- Site URL: `https://app.veltzy.com.br`
- Redirect URLs: `https://app.veltzy.com.br/**`

### Criar Storage Buckets
Dashboard > Storage:
- `chat-attachments` (privado)
- `company-assets` (publico)

## 2. Vercel

### Deploy automatico
1. Importar repositorio GitHub no Vercel (vercel.com/new)
2. Framework preset: Vite (detectado automaticamente via `vercel.json`)
3. Adicionar variaveis de ambiente:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_URL`
4. Deploy

### Dominio customizado
1. Settings > Domains > Add domain
2. Configurar DNS: CNAME `app` -> `cname.vercel-dns.com`
3. SSL provisionado automaticamente

## 3. Deploy manual
```bash
npm run build
npx vercel --prod
```

## Troubleshooting

- **Tela branca**: verificar variaveis de ambiente no Vercel
- **RLS errors**: verificar se migrations foram aplicadas
- **Edge Function 500**: verificar secrets no Supabase
- **Auth redirect loop**: verificar Site URL e Redirect URLs
- **404 em rotas**: verificar rewrites no vercel.json
