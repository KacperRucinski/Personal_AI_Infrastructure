#!/usr/bin/env bash
# Validate that the v5 release does not contain runtime references to mixed-case
# PAI paths that break on Linux case-sensitive filesystems.

set -euo pipefail

ROOT="${1:-$(pwd)}"
CLAUDE_ROOT="$ROOT"
if [ -d "$ROOT/Releases/v5.0.0/.claude" ]; then
  CLAUDE_ROOT="$ROOT/Releases/v5.0.0/.claude"
fi

failures=0

fail() {
  failures=$((failures + 1))
  printf '✗ %s\n' "$*" >&2
}

ok() { printf '✓ %s\n' "$*"; }

if [ ! -d "$CLAUDE_ROOT/PAI" ]; then
  fail "PAI directory not found under $CLAUDE_ROOT"
  exit 1
fi

# Canonical shipped directories must exist.
for dir in PULSE TOOLS MEMORY ALGORITHM DOCUMENTATION TEMPLATES; do
  if [ -d "$CLAUDE_ROOT/PAI/$dir" ]; then
    ok "PAI/$dir exists"
  else
    fail "missing canonical directory: PAI/$dir"
  fi
done

# Mixed-case runtime path references are forbidden. Documentation may mention
# them only in migration notes or historical explanations, so this scan is
# intentionally scoped to executable/config files.
mapfile -t files < <(
  find "$CLAUDE_ROOT" -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.json' -o -name '*.toml' -o -name '*.sh' -o -name '*.zsh' -o -name '*.bash' \) \
    ! -path '*/node_modules/*' \
    ! -path '*/Observability/out/*' \
    | sort
)

patterns=(
  'PAI/Pulse'
  'PAI/Tools'
  'PAI/Memory'
  'PAI/Algorithm'
  'PAI/Documentation'
  'PAI/Templates'
  '"Pulse"'
  '"Tools"'
)

for file in "${files[@]}"; do
  for pattern in "${patterns[@]}"; do
    if grep -nF "$pattern" "$file" >/tmp/pai-case-contract.$$ 2>/dev/null; then
      # Allow this validator and Linux repair scripts to mention bad patterns.
      case "$file" in
        */validate-linux-case-contract.sh|*/linux-hotfix.sh|*/pai-v5-doctor.sh) continue ;;
      esac
      while IFS= read -r hit; do
        fail "forbidden mixed-case path reference in ${file#$CLAUDE_ROOT/}: $hit"
      done < /tmp/pai-case-contract.$$
    fi
  done
done
rm -f /tmp/pai-case-contract.$$

if [ "$failures" -eq 0 ]; then
  ok "Linux case-sensitivity contract passed"
  exit 0
fi

printf '\n%s Linux case-sensitivity contract failure(s).\n' "$failures" >&2
exit 1
