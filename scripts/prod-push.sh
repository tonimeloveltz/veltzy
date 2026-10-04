#!/usr/bin/env bash
set -euo pipefail

STAGING_REF="hfebvugdsztnzgpybdwj"
PROD_REF="zxefzegggntfjlfsdgvw"
MODE="${1:-}"

if [[ "$MODE" != "--dry-run" && "$MODE" != "--apply" ]]; then
  echo "uso: prod-push.sh --dry-run | --apply"; exit 1
fi

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" == "main" ] || { echo "❌ produção só a partir da main"; exit 1; }
git pull -q --ff-only

trap 'supabase link --project-ref "$STAGING_REF" >/dev/null 2>&1 && echo "↩️  link de volta no staging"' EXIT

supabase link --project-ref "$PROD_REF"

if [ "$MODE" == "--dry-run" ]; then
  supabase db push --dry-run
  echo "👆 Migrations que subiriam. Aguarde confirmação do Toni antes do --apply."
else
  supabase db push
  echo "✅ Aplicado em produção."
fi
