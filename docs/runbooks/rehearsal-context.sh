#!/bin/bash
# rehearsal-context.sh (portable: sourceable in bash AND zsh; prompts use printf+read, not read -p) : isolated, named execution contexts for the Part 14 completion rehearsal.
#
# PROBLEM SOLVED (Codex round-3 blocker 4): one shell cannot hold the D (target) and B (backup)
# PGHOST/PGPASSWORD sets simultaneously, and pg_dump/pg_restore must never be accidentally
# reversed. This wrapper keeps each context's values in shell memory under NAMED prefixes and only
# materialises them as libpq environment variables inside a per-command SUBSHELL, after an explicit
# target-identity check.
#
# SECRECY RULES ENFORCED BY CONSTRUCTION:
#   - passwords/secrets are read with `read -s` (no echo, no shell history);
#   - values are exported as ENVIRONMENT VARIABLES inside a subshell only: never placed in any
#     command argument, never printed, never written to disk/evidence, never sent to a provider;
#   - the visible transcript shows only the context NAME, the expected endpoint FIRST LABEL and
#     the command word (e.g. "[ctx D -> ep-xxxx] pg_dump ...args-without-connection...").
#
# USAGE (source it, then; call ctx_load INTERACTIVELY or with stdin REDIRECTION: piping into it
# runs it in a subshell and nothing persists):
#   ctx_load D          # prompts: expected endpoint first label (visible), host (visible),
#                       #          user (visible), database (visible), password (hidden)
#   ctx_load B
#   ctx_run  D psql -X -q -tA -v ON_ERROR_STOP=1 -f docs/runbooks/logical-manifest.sql
#   ctx_run  B pg_dump --format=custom --no-owner --no-privileges -f pre.dump
#   ctx_run  D pg_restore --single-transaction --exit-on-error --no-owner --no-privileges pre.dump
#   ctx_prisma D migrate deploy      # DATABASE_URL constructed IN the subshell, env-only
#   r2_load                          # prompts R2_ENDPOINT/R2_BUCKET (visible), key id + secret (hidden)
#   r2_run node_modules/.bin/tsx prisma/cleanup-agreement-probe.ts ...
#
# TARGET-IDENTITY CHECK: ctx_load records the EXPECTED first label; it refuses to load if the
# entered host's first label differs, and ctx_run re-verifies before every command, so a D command
# can never run against B (or vice versa) even after a mistyped reload.

_ctx_get() { eval "printf '%s' \"\${CTX_${1}_${2}}\""; }

ctx_load() {
  local name="$1"
  [ -n "$name" ] || { echo "ctx_load: usage: ctx_load <NAME>" >&2; return 1; }
  local expect host user db pass
  printf '%s' "[$name] expected endpoint FIRST LABEL (e.g. ep-xxxx-yyyy-zzzzzz): "; read -r expect
  printf '%s' "[$name] host (full, not printed again): "; read -r host
  if [ -z "$expect" ] || [ -z "$host" ]; then
    echo "[$name] REFUSED: expected label and host must be non-empty." >&2
    return 1
  fi
  if [ "${host%%.*}" != "$expect" ]; then
    echo "[$name] REFUSED: host first label '${host%%.*}' does not equal expected '$expect'." >&2
    return 1
  fi
  printf '%s' "[$name] user: "; read -r user
  printf '%s' "[$name] database: "; read -r db
  printf '%s' "[$name] password (hidden): "; read -r -s pass; echo
  if [ -z "$user" ] || [ -z "$db" ]; then
    echo "[$name] REFUSED: user and database must be non-empty." >&2
    return 1
  fi
  eval "CTX_${name}_EXPECT=\$expect CTX_${name}_HOST=\$host CTX_${name}_USER=\$user CTX_${name}_DB=\$db CTX_${name}_PASS=\$pass"
  echo "[$name] loaded (endpoint label: $expect)"
}

_ctx_verify() {
  local name="$1" host expect
  host="$(_ctx_get "$name" HOST)"; expect="$(_ctx_get "$name" EXPECT)"
  [ -n "$host" ] || { echo "[$name] not loaded (ctx_load $name first)" >&2; return 1; }
  if [ "${host%%.*}" != "$expect" ]; then
    echo "[$name] IDENTITY MISMATCH: refusing." >&2; return 1
  fi
}

ctx_run() {
  local name="$1"; shift
  _ctx_verify "$name" || return 1
  echo "[ctx $name -> $(_ctx_get "$name" EXPECT)] $1"
  ( export PGHOST="$(_ctx_get "$name" HOST)" PGUSER="$(_ctx_get "$name" USER)" \
           PGDATABASE="$(_ctx_get "$name" DB)" PGPASSWORD="$(_ctx_get "$name" PASS)" \
           PGSSLMODE=require
    "$@" )
}

# Prisma needs DATABASE_URL. It is constructed INSIDE the subshell from the context parts (password
# URI-encoded via jq) and exported as an environment variable only: it never appears in argv, shell
# history, logs, chat, or evidence files.
ctx_prisma() {
  local name="$1"; shift
  _ctx_verify "$name" || return 1
  echo "[ctx $name -> $(_ctx_get "$name" EXPECT)] prisma $1"
  ( u="$(_ctx_get "$name" USER)"; p="$(_ctx_get "$name" PASS)"; h="$(_ctx_get "$name" HOST)"; d="$(_ctx_get "$name" DB)"
    ep="$(jq -rn --arg v "$p" '$v|@uri')"
    export DATABASE_URL="postgresql://${u}:${ep}@${h}/${d}?sslmode=require"
    node_modules/.bin/prisma "$@" )
}

# Owner-controlled ephemeral R2 injection (equivalent procedure for the Part 14 step-7 lanes).
r2_load() {
  local ep bucket kid secret
  printf '%s' "[R2] endpoint URL: "; read -r ep
  printf '%s' "[R2] bucket (PRIVATE document bucket): "; read -r bucket
  printf '%s' "[R2] access key id (hidden): "; read -r -s kid; echo
  printf '%s' "[R2] secret access key (hidden): "; read -r -s secret; echo
  R2CTX_ENDPOINT=$ep R2CTX_BUCKET=$bucket R2CTX_KID=$kid R2CTX_SECRET=$secret
  echo "[R2] loaded (bucket: $bucket)"
}

r2_run() {
  [ -n "$R2CTX_ENDPOINT" ] || { echo "[R2] not loaded (r2_load first)" >&2; return 1; }
  echo "[R2 ctx] $1"
  ( export R2_ENDPOINT="$R2CTX_ENDPOINT" R2_BUCKET="$R2CTX_BUCKET" \
           R2_ACCESS_KEY_ID="$R2CTX_KID" R2_SECRET_ACCESS_KEY="$R2CTX_SECRET"
    "$@" )
}
