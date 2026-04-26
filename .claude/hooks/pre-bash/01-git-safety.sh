#!/usr/bin/env bash
#
# Redeemo workflow hook v1 — high-risk Git rules only.
#
# PreToolUse hook for the Bash tool. Reads the tool-call JSON from stdin,
# extracts the command being run, and either:
#   - exits 2 with an instructive message on stderr (blocks the call), or
#   - prints a warning to stderr but exits 0 (allows the call), or
#   - exits 0 silently (allows the call without comment).
#
# Override env vars (must be set on the same command line as the blocked call):
#   REDEEMO_CONFIRM_HARD_RESET=1     — allow `git reset --hard`
#   REDEEMO_CONFIRM_GIT_CLEAN=1      — allow `git clean -f / -d / -x / --force`
#   REDEEMO_PR_SCOPE_VERIFIED=<sha>  — allow `gh pr merge` for the PR whose
#                                      head matches <sha> (run live compare first)
#
# Dependencies: jq, git, gh.
#
# Hooks live under .claude/hooks/. See CLAUDE.md "Workflow Hooks" section.

set -euo pipefail

# ── Read tool input ─────────────────────────────────────────────────────────

INPUT=$(cat 2>/dev/null || echo "")
if [ -z "$INPUT" ]; then
  # No input — fail-open (don't block on hook plumbing bugs).
  exit 0
fi

# Extract the command. Fail-open if jq is missing or input isn't parseable.
if ! command -v jq >/dev/null 2>&1; then
  printf '[hook warn] jq not installed — git-safety hook is no-op. Install jq to enable.\n' >&2
  exit 0
fi

CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")
if [ -z "$CMD" ]; then
  exit 0
fi

# ── Helpers ─────────────────────────────────────────────────────────────────

block() {
  local title="$1"
  shift
  printf '\n[hook block] %s\n' "$title" >&2
  for line in "$@"; do
    printf '    %s\n' "$line" >&2
  done
  printf '\n' >&2
  exit 2
}

warn() {
  printf '[hook warn] %s\n' "$1" >&2
}

# ── Block rules ─────────────────────────────────────────────────────────────

# 1. Broad git add (.,  -A, --all, *).
if [[ "$CMD" =~ (^|[[:space:]])git[[:space:]]+add([[:space:]]+[^[:space:]]+)*[[:space:]]+(\.|-A|--all|\*)([[:space:]]|$) ]]; then
  block "git add . / -A / --all is blocked" \
        "Use explicit paths: git add path/to/file1 path/to/file2" \
        "Broad adds catch unstaged secrets, debug files, and out-of-scope changes."
fi

# 2. Direct push to main (any refspec where the destination is 'main').
if [[ "$CMD" =~ (^|[[:space:]])git[[:space:]]+push.* ]]; then
  if [[ "$CMD" =~ (:main([[:space:]]|$)|[[:space:]]main$|[[:space:]]main[[:space:]]) ]]; then
    block "Direct push to main is forbidden" \
          "Open a PR instead: gh pr create --base main --head <branch>" \
          "Verify scope via gh api compare before merging via gh pr merge."
  fi
fi

# 3. Force push without --force-with-lease.
if [[ "$CMD" =~ (^|[[:space:]])git[[:space:]]+push.* ]]; then
  if [[ "$CMD" =~ ((^|[[:space:]])--force([[:space:]]|$)|[[:space:]]-f([[:space:]]|$)) ]] && \
     ! [[ "$CMD" =~ --force-with-lease ]]; then
    block "Plain --force / -f push is blocked" \
          "Plain force-push can clobber unseen origin work (other contributors, CI, IDE syncs)." \
          "Use: git push --force-with-lease origin <branch>"
  fi
fi

# 4. git reset --hard (always block; require explicit override).
if [[ "$CMD" =~ (^|[[:space:]])git[[:space:]]+reset[[:space:]]+(.*[[:space:]])?--hard([[:space:]]|$) ]]; then
  if [ "${REDEEMO_CONFIRM_HARD_RESET:-}" != "1" ]; then
    block "git reset --hard is blocked" \
          "This discards uncommitted work and rewrites HEAD irreversibly." \
          "If intentional, re-run with: REDEEMO_CONFIRM_HARD_RESET=1 git reset --hard ..."
  fi
fi

# 5. Destructive git clean (-f / -d / -x / --force).
if [[ "$CMD" =~ (^|[[:space:]])git[[:space:]]+clean[[:space:]] ]]; then
  if [[ "$CMD" =~ ([[:space:]]-[a-zA-Z]*[fdx][a-zA-Z]*([[:space:]]|$)|--force) ]]; then
    if [ "${REDEEMO_CONFIRM_GIT_CLEAN:-}" != "1" ]; then
      block "git clean -f / -d / -x is blocked" \
            "This deletes untracked files irreversibly." \
            "Run with --dry-run (-n) first to see what would be deleted." \
            "If intentional: REDEEMO_CONFIRM_GIT_CLEAN=1 git clean ..."
    fi
  fi
fi

# 6. gh pr merge — live-compare scope-verification gate.
if [[ "$CMD" =~ (^|[[:space:]])gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|$) ]]; then
  # Resolve PR number: explicit on command line, else current branch's PR.
  PR_NUM=$(printf '%s' "$CMD" | grep -oE 'gh[[:space:]]+pr[[:space:]]+merge[[:space:]]+[0-9]+' | grep -oE '[0-9]+$' | head -1 || echo "")
  if [ -z "$PR_NUM" ]; then
    PR_NUM=$(gh pr view --json number --jq '.number' 2>/dev/null || echo "")
  fi
  if [ -z "$PR_NUM" ]; then
    block "gh pr merge: could not determine PR number" \
          "Specify explicitly: gh pr merge <N>"
  fi

  # Resolve PR's current head SHA from GitHub.
  HEAD_SHA=$(gh pr view "$PR_NUM" --json headRefOid --jq '.headRefOid' 2>/dev/null || echo "")
  if [ -z "$HEAD_SHA" ]; then
    block "gh pr merge: could not fetch PR #${PR_NUM} head SHA" \
          "Check: gh auth status"
  fi

  if [ "${REDEEMO_PR_SCOPE_VERIFIED:-}" != "$HEAD_SHA" ]; then
    REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner' 2>/dev/null || echo "<owner>/<repo>")
    block "PR #${PR_NUM} merge blocked — scope verification required" \
          "Run live compare to see actual commit/file scope:" \
          "" \
          "  gh api \"repos/${REPO}/compare/main...${HEAD_SHA}\" \\" \
          "    --jq '{ahead_by, total_commits, files_changed: (.files | length), commits: [.commits[].sha[0:7]]}'" \
          "" \
          "Confirm scope matches expectation, then re-run with:" \
          "" \
          "  REDEEMO_PR_SCOPE_VERIFIED=${HEAD_SHA} ${CMD}" \
          "" \
          "The env var binds to the head SHA, so a new commit on the PR head" \
          "between verification and merge causes this gate to re-block."
  fi
fi

# ── Warn rules (non-blocking) ───────────────────────────────────────────────

# 7. npm install — package-lock.json may change.
if [[ "$CMD" =~ (^|[[:space:]])npm[[:space:]]+(install|i)([[:space:]]|$) ]]; then
  warn "npm install: package-lock.json may change; verify diff before staging."
fi

# 8. git commit when many files staged (>30).
if [[ "$CMD" =~ (^|[[:space:]])git[[:space:]]+commit([[:space:]]|$) ]]; then
  STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ' || echo "0")
  if [ "${STAGED:-0}" -gt 30 ]; then
    warn "git commit: ${STAGED} files staged. Confirm scope before committing."
    git diff --cached --stat 2>/dev/null | tail -10 >&2 || true
  fi
fi

# 9. git push when local main is ahead of origin/main.
if [[ "$CMD" =~ (^|[[:space:]])git[[:space:]]+push([[:space:]]|$) ]]; then
  AHEAD=$(git rev-list --count origin/main..main 2>/dev/null || echo "0")
  if [ "${AHEAD:-0}" -gt 0 ]; then
    warn "Local main is ${AHEAD} commits ahead of origin/main."
    warn "If pushing a feature branch built on local main, those commits will ride along."
    warn "Verify scope: git log --oneline origin/main..HEAD"
  fi
fi

exit 0
