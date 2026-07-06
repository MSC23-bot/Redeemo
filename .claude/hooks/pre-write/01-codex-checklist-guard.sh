#!/usr/bin/env bash
# Codex-checklist write guard (PreToolUse).
#
# The three workflow checklists under ~/Documents/Playground/redeemo-notes/ are owned and
# maintained EXCLUSIVELY by Codex (see docs/PROJECT-STATE.md §2). Claude may read them as
# evidence but must never edit, append to, rename, move, or delete them.
#
# Registered for: Edit|Write|MultiEdit|NotebookEdit (file_path check) and Bash (heuristic
# destructive-write check). Follows the same conventions as 01-git-safety.sh: requires jq,
# fails open with a warning if the guard itself cannot run.

set -u

command -v jq >/dev/null 2>&1 || { echo "codex-checklist-guard: jq not found; guard skipped" >&2; exit 0; }

INPUT="$(cat 2>/dev/null || true)"
[ -n "$INPUT" ] || exit 0

TOOL_NAME="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
[ -n "$TOOL_NAME" ] || exit 0

# Pattern identifying the protected files (all three checklists match it).
GUARD_DIR="Playground/redeemo-notes"
GUARD_TOKEN="workflow-checklist"

block() {
  echo "BLOCKED: $1" >&2
  echo "The Codex workflow checklists under ~/Documents/Playground/redeemo-notes/ are Codex-owned and READ-ONLY for Claude (PROJECT-STATE.md §2). Read them for evidence; never write. There is no override." >&2
  exit 2
}

case "$TOOL_NAME" in
  Edit|Write|MultiEdit|NotebookEdit)
    FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null || true)"
    if printf '%s' "$FILE_PATH" | grep -q "$GUARD_DIR" && printf '%s' "$FILE_PATH" | grep -q "$GUARD_TOKEN"; then
      block "attempt to modify a Codex-owned checklist via $TOOL_NAME: $FILE_PATH"
    fi
    ;;
  Bash)
    CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
    if printf '%s' "$CMD" | grep -q "$GUARD_TOKEN"; then
      # Block only when a write/destructive operator plausibly targets the checklist:
      # redirection into it, in-place edit, tee, rm/mv/truncate/dd with it as an operand.
      if printf '%s' "$CMD" | grep -Eq "(>>?[[:space:]]*[^[:space:]]*${GUARD_TOKEN}|tee[[:space:]]+(-a[[:space:]]+)?[^[:space:]]*${GUARD_TOKEN}|sed[[:space:]]+-i[^|;&]*${GUARD_TOKEN}|(^|[;&|][[:space:]]*)(rm|mv|truncate|shred)[[:space:]][^|;&]*${GUARD_TOKEN}|dd[[:space:]][^|;&]*of=[^[:space:]]*${GUARD_TOKEN})"; then
        block "Bash command appears to write to / remove a Codex-owned checklist"
      fi
    fi
    ;;
esac

exit 0
