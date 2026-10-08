#!/usr/bin/env bash
set -uo pipefail

SPEC="${1:-}"
fail() { echo "❌ PVO: $1"; exit 1; }

echo "1/3 Tipos"
npx tsc -b || fail "erro de tipo"

echo "2/3 Build"
npm run build || fail "build quebrado"

echo "3/3 Diff"
git fetch -q origin develop 2>/dev/null
changed=$( { git diff --name-only origin/develop...HEAD 2>/dev/null; \
             git diff --name-only HEAD; \
             git ls-files --others --exclude-standard; } | sed '/^$/d' | sort -u )

[ -z "$changed" ] && fail "nenhuma mudança real no diff"

if [ -z "$SPEC" ]; then
  echo "Arquivos alterados (comparar com o escopo declarado da trilha P):"
  echo "$changed"
  echo "🟡 PVO 1-3 ok. Falta: verificação funcional no browser."
  exit 0
fi

[ -f "$SPEC" ] || fail "SPEC não encontrada em $SPEC"

expected=$(sed -n '/<!-- arquivos -->/,/<!-- \/arquivos -->/p' "$SPEC" \
  | grep -v '<!--' | sed 's/^[-* ]*//; s/`//g' | sed '/^$/d' | sort -u)

allow='^(package-lock\.json|src/types/database\.types\.ts|specs/.*)$'

extra=$(comm -23 <(echo "$changed") <(echo "$expected") | grep -Ev "$allow" || true)
missing=$(comm -13 <(echo "$changed") <(echo "$expected") || true)

if [ -n "$extra" ]; then
  echo "Arquivos alterados fora da SPEC:"; echo "$extra"
  fail "diff extrapola a SPEC. Justificar e atualizar a SPEC, ou reverter."
fi
if [ -n "$missing" ]; then
  echo "Arquivos da SPEC sem alteração:"; echo "$missing"
  fail "implementação incompleta"
fi

echo "🟡 PVO 1-3 ok. Falta: verificação funcional no browser (Playwright MCP)."
