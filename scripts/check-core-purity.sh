#!/usr/bin/env bash
# scripts/check-core-purity.sh
# Fails if src/core (non-test) contains forbidden imports.
set -euo pipefail

FORBIDDEN="(node:(fs|path|os)|core/(fs|locks|config|paths|logger|package|constants|cv|toolhash|toolhash)|src/(storage|lib)/)"

# Collect non-test source files under src/core/
# Exclude src/core/tests/ — tests legitimately use node:fs for temp dirs.
SRC_FILES=$(find src/core -maxdepth 1 -name "*.ts" -type f 2>/dev/null || true)
DIR_FILES=$(find src/core -mindepth 2 -name "*.ts" -type f -not -path "*/tests/*" -not -name "*.test.ts" 2>/dev/null || true)

ALL_FILES=$(printf '%s\n' "$SRC_FILES" "$DIR_FILES" | sort -u | grep -v "^$" || true)

if [ -z "$ALL_FILES" ]; then
  echo "PASS: no source files to check in src/core/."
  exit 0
fi

# Check each file
FAILED=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  # Skip allowlisted files (marker in first 3 lines)
  if head -3 "$f" | grep -q "purity-exempt"; then
    continue
  fi
  MATCH=$(grep -nE "import .* from '(${FORBIDDEN})'" "$f" 2>/dev/null || true)
  if [ -n "$MATCH" ]; then
    FAILED="${FAILED}\n${f}:\n${MATCH}"
  fi
done <<< "$ALL_FILES"

if [ -n "$FAILED" ]; then
  printf "FAIL: forbidden imports in src/core/:%b\n" "$FAILED"
  echo ""
  echo "src/core/ must remain I/O-free. Move I/O to src/lib/ or src/workflow/."
  echo "If exempt, add '// purity-exempt: <reason>' as the first line."
  exit 1
fi

echo "PASS: src/core/ purity check green."
