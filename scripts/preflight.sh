#!/usr/bin/env bash
set -uo pipefail

STAGING_REF="hfebvugdsztnzgpybdwj"
PROD_REF="zxefzegggntfjlfsdgvw"

fail() { echo "❌ PREFLIGHT: $1"; exit 1; }
ok()   { echo "✅ $1"; }
warn() { echo "⚠️  $1"; }

# 1. Branch
branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" == "main" || "$branch" == "develop" ]]; then
  fail "branch atual é $branch. Crie uma feature/* a partir da develop."
fi
ok "branch $branch"

# 2. Link do Supabase
if [ -f supabase/.temp/project-ref ]; then
  ref=$(cat supabase/.temp/project-ref)
  if [ "$ref" == "$PROD_REF" ]; then
    fail "Supabase linkado em PRODUÇÃO. Rode: supabase link --project-ref $STAGING_REF"
  elif [ "$ref" != "$STAGING_REF" ]; then
    fail "Supabase linkado em ref desconhecido ($ref)."
  fi
  ok "Supabase linkado no staging"
else
  warn "repo sem link Supabase (ok se este repo não aplica migrations)"
fi

# 3. service_role fora do client
if grep -rniE "service_role|SERVICE_ROLE" src/ >/dev/null 2>&1; then
  fail "referência a service_role dentro de src/. Ela só pode viver em Supabase Secrets."
fi
if ls .env* >/dev/null 2>&1 && grep -hiE "^VITE_.*SERVICE" .env* >/dev/null 2>&1; then
  fail "variável VITE_ com service role no .env. Tudo com prefixo VITE_ vai para o browser."
fi
ok "service_role fora do client"

# 4. .env fora do git
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  fail ".env está versionado. Rode: git rm --cached .env e confira o .gitignore."
fi
ok ".env fora do git"

# 5. Extensões que o banco precisa (aviso)
if [ -d supabase/migrations ]; then
  if grep -rq "net.http_post" supabase/migrations; then
    warn "migrations usam pg_net. Confirme no banco: SELECT * FROM pg_extension WHERE extname = 'pg_net';"
  fi
  if grep -rq "cron.schedule" supabase/migrations; then
    warn "migrations usam pg_cron. Confirme que a extensão está habilitada."
  fi
fi

# 6. Edge Functions públicas declaradas
if [ -f supabase/config.toml ] && grep -q "verify_jwt = false" supabase/config.toml; then
  ok "Edge Functions públicas declaradas no config.toml"
fi

echo "🟢 Preflight ok"
