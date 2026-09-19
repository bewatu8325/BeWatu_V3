#!/usr/bin/env bash
# scripts/check-ai-provider-boundary.sh
# ─────────────────────────────────────────────────────────────────────────────
# Fails if any file outside the allowlist below references an AI provider
# directly -- its SDK, its API key env var, or its raw HTTP endpoint. The
# whole point of api/ai.ts is that every client-facing AI feature goes
# through one normalized contract with the active provider chosen by the
# AI_PROVIDER env var; a component or service file that imports @google/genai
# or reads ANTHROPIC_API_KEY directly has quietly stepped outside that and
# can't be moved to a different provider by changing one env var anymore.
#
# Run locally: bash scripts/check-ai-provider-boundary.sh
# Wired into CI: .github/workflows/security.yml
#
# ALLOWLIST, and why each entry is here instead of a genuine violation:
#
#   - api/ai.ts
#     The adapter itself. This is the one file allowed to know both
#     providers' shapes.
#
#   - api/security/agent.ts, api/security/approve.ts, api/security/finding.ts,
#     api/skills-trajectory.ts, api/verify-reel.ts
#     Five pre-existing, server-to-server integrations (Vercel function ->
#     Anthropic API directly) that predate api/ai.ts and were never part of
#     the client-facing consolidation this check protects. Their API key
#     never reaches a browser either way -- they're each their own backend
#     feature (the security agent, skills-trajectory analysis, reel
#     verification, security-finding triage/approval), not a thin "show the
#     user some AI text" UI call. All five hardcode Claude specifically
#     (claude-sonnet-4-6 / claude-opus-4-6), so there's no live
#     multi-provider drift risk today -- but they have NOT been assessed for
#     whether they could/should move onto api/ai.ts, and this allowlist
#     entry is a known gap, not a decision that they're fine forever. Remove
#     an entry here only after actually migrating that file, not to silence
#     a new violation.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ALLOWLIST=(
  "api/ai.ts"
  "api/security/agent.ts"
  "api/security/approve.ts"
  "api/security/finding.ts"
  "api/skills-trajectory.ts"
  "api/verify-reel.ts"
)

PATTERN='@google/genai|@anthropic-ai/sdk|ANTHROPIC_API_KEY|GEMINI_API_KEY|api\.anthropic\.com|generativelanguage\.googleapis\.com'

is_allowed() {
  local file="$1"
  for allowed in "${ALLOWLIST[@]}"; do
    [[ "$file" == "$allowed" ]] && return 0
  done
  return 1
}

violations=0
while IFS= read -r -d '' file; do
  rel="${file#./}"
  if grep -qE "$PATTERN" "$file" 2>/dev/null; then
    if is_allowed "$rel"; then
      continue
    fi
    echo "❌ $rel references an AI provider directly:"
    grep -nE "$PATTERN" "$file" | sed 's/^/     /'
    violations=$((violations + 1))
  fi
done < <(find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
  -not -path "./node_modules/*" -not -path "*/node_modules/*" -not -path "./dist/*" -print0)

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "$violations file(s) reference an AI provider outside api/ai.ts and the documented allowlist."
  echo "Either route the call through api/ai.ts, or add it to ALLOWLIST in this script with a real reason."
  exit 1
fi

echo "✅ No AI provider leakage outside api/ai.ts and the documented allowlist."
