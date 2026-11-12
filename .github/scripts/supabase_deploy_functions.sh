#!/usr/bin/env bash
# Deploya functions por nome, nunca apaga. verify_jwt vem so do config.toml.
# Uma falha nao para as outras; o script falha no fim se alguma falhou.
# Copia do script do Hub (hub/.github/scripts/); mudanca aqui vale la tambem.
# Uso: supabase_deploy_functions.sh <project-ref> <lista-json>
set -uo pipefail

REF="$1"
FUNCTIONS="$2"
falhas=0

{ echo "### Functions"; echo; echo "| Function | Resultado |"; echo "|---|---|"; } >> "$GITHUB_STEP_SUMMARY"

while read -r nome; do
  [[ "$nome" =~ ^[a-z0-9-]+$ ]] || { echo "Nome invalido: $nome"; exit 1; }
  if supabase functions deploy "$nome" --use-api --project-ref "$REF"; then
    echo "| $nome | ok |" >> "$GITHUB_STEP_SUMMARY"
  else
    echo "| $nome | **falhou** |" >> "$GITHUB_STEP_SUMMARY"
    falhas=$((falhas + 1))
  fi
done < <(python3 -c 'import json,sys; print("\n".join(json.loads(sys.argv[1])))' "$FUNCTIONS")

[ "$falhas" -eq 0 ] || { echo "$falhas function(s) falharam."; exit 1; }
