#!/bin/bash
# rehearsal-context.sh (rev 2026-07-20): isolated, named execution contexts for the Part 14
# completion rehearsal. Sourceable in bash AND zsh (prompts use printf+read, never `read -p`).
#
# DESIGN (Codex round-4):
#   - EXACTLY two context names exist: D (target) and B (backup). Anything else is refused.
#     Storage is explicit per-name variables selected by `case`: there is NO eval and NO dynamic
#     shell evaluation anywhere in this file.
#   - ENDPOINT PINNING: `ctx_pin D <label>` / `ctx_pin B <label>` record the EXPECTED endpoint
#     first labels from the BRANCH-CREATION EVIDENCE, as a separate step BEFORE any credential
#     entry. Pins must be distinct (same-endpoint D/B refused). `ctx_load` cannot set or change a
#     pin; it only supplies credentials, and the entered host must match the already-pinned label.
#     Every operation re-verifies the pinned identity. NOTE (honest claim): pinning prevents
#     credential-entry mixups and command reversal ONCE THE PINS ARE CORRECT; the pins themselves
#     must be transcribed correctly from the branch-creation evidence: that transcription is the
#     operator's checked, logged step.
#   - XTRACE FAIL-CLOSED: every entrypoint refuses BEFORE reading or expanding any credential if
#     shell tracing (`set -x`) is active in the calling shell, because xtrace would echo expanded
#     values (including PGPASSWORD) to stderr.
#   - STDOUT DISCIPLINE: ALL operational output (prompts, banners, errors) goes to STDERR. The
#     stdout of `ctx_run`/`ctx_prisma`/`r2_run` is EXACTLY the child command's stdout, so
#     `ctx_run D psql ... > manifest.txt` captures the manifest alone (identical across D/B).
#   - SECRECY: passwords/secrets via `read -s` (no echo, no history); values materialise only as
#     environment variables inside a per-command SUBSHELL: never argv, never printed, never
#     persisted, never provider-stored. DATABASE_URL is built inside the subshell with EVERY
#     component (user, password, database) URI-encoded via jq @uri.
#   - Call `ctx_pin`/`ctx_load` interactively or with stdin REDIRECTION; piping into them runs a
#     subshell and nothing persists.
#
# USAGE:
#   source docs/runbooks/rehearsal-context.sh
#   ctx_pin  D ep-aaaa-bbbb-cccccc     # from the D branch-creation evidence
#   ctx_pin  B ep-dddd-eeee-ffffff     # from the B branch-creation evidence (must differ)
#   ctx_load D                          # prompts host/user/database (visible), password (hidden)
#   ctx_load B
#   ctx_run  D psql -X -q -tA -v ON_ERROR_STOP=1 -f docs/runbooks/logical-manifest.sql > m.txt
#   ctx_run  B pg_dump --format=custom --no-owner --no-privileges -f pre.dump
#   ctx_prisma D migrate deploy
#   ctx_env  D r2_run node_modules/.bin/tsx prisma/cleanup-agreement-probe.ts ... --delete-r2
#   r2_load; r2_run node_modules/.bin/tsx prisma/r2-rehearsal.ts list <uuid>

_ctx_err() { printf '%s\n' "$*" >&2; }

# Refuse if xtrace is active in the CALLING shell (bash and zsh both expose it in $-).
_ctx_no_xtrace() {
  case "$-" in
    *x*) _ctx_err "REFUSED: shell tracing (set -x) is active; it would echo credentials. Run 'set +x' first."; return 1 ;;
  esac
  return 0
}

# Validate a context name: exactly D or B.
_ctx_name_ok() {
  case "$1" in
    D|B) return 0 ;;
    *) _ctx_err "REFUSED: context name must be exactly 'D' or 'B' (got '${1:-}')."; return 1 ;;
  esac
}

# Explicit per-name storage (no eval anywhere).
CTX_D_PIN=""; CTX_D_HOST=""; CTX_D_USER=""; CTX_D_DB=""; CTX_D_PASS=""
CTX_B_PIN=""; CTX_B_HOST=""; CTX_B_USER=""; CTX_B_DB=""; CTX_B_PASS=""

# ctx_pin <D|B> <endpoint-first-label> : pin the expected endpoint from branch-creation evidence.
ctx_pin() {
  _ctx_no_xtrace || return 1
  _ctx_name_ok "$1" || return 1
  local name="$1" label="$2"
  if [ -z "$label" ] || [ "${#label}" -lt 8 ]; then
    _ctx_err "[$name] REFUSED: pin label must be the endpoint first label (>= 8 chars) from the branch-creation evidence."
    return 1
  fi
  case "$label" in
    *.*|*/*|*" "*) _ctx_err "[$name] REFUSED: pin must be the FIRST LABEL only (no dots/slashes/spaces)."; return 1 ;;
  esac
  case "$name" in
    D) if [ -n "$CTX_B_PIN" ] && [ "$CTX_B_PIN" = "$label" ]; then _ctx_err "[D] REFUSED: same endpoint as B; D and B must be DISTINCT branches."; return 1; fi
       CTX_D_PIN="$label"; CTX_D_HOST=""; CTX_D_USER=""; CTX_D_DB=""; CTX_D_PASS="" ;;
    B) if [ -n "$CTX_D_PIN" ] && [ "$CTX_D_PIN" = "$label" ]; then _ctx_err "[B] REFUSED: same endpoint as D; D and B must be DISTINCT branches."; return 1; fi
       CTX_B_PIN="$label"; CTX_B_HOST=""; CTX_B_USER=""; CTX_B_DB=""; CTX_B_PASS="" ;;
  esac
  _ctx_err "[$name] pinned to endpoint label: $label (credentials cleared; ctx_load $name next)"
}

# ctx_load <D|B> : supply credentials for an ALREADY-PINNED context. Cannot set/alter the pin.
ctx_load() {
  _ctx_no_xtrace || return 1
  _ctx_name_ok "$1" || return 1
  local name="$1" pin host user db pass
  case "$name" in D) pin="$CTX_D_PIN" ;; B) pin="$CTX_B_PIN" ;; esac
  if [ -z "$pin" ]; then
    _ctx_err "[$name] REFUSED: not pinned. Run: ctx_pin $name <endpoint-first-label> (from branch-creation evidence) first."
    return 1
  fi
  printf '%s' "[$name / pinned $pin] host (full): " >&2; read -r host
  if [ -z "$host" ]; then _ctx_err "[$name] REFUSED: host must be non-empty."; return 1; fi
  if [ "${host%%.*}" != "$pin" ]; then
    _ctx_err "[$name] REFUSED: host first label '${host%%.*}' does not match the pinned endpoint '$pin'."
    return 1
  fi
  printf '%s' "[$name] user: " >&2; read -r user
  printf '%s' "[$name] database: " >&2; read -r db
  printf '%s' "[$name] password (hidden): " >&2; read -r -s pass; _ctx_err ""
  if [ -z "$user" ] || [ -z "$db" ] || [ -z "$pass" ]; then
    _ctx_err "[$name] REFUSED: user, database and password must all be non-empty."
    return 1
  fi
  case "$name" in
    D) CTX_D_HOST="$host"; CTX_D_USER="$user"; CTX_D_DB="$db"; CTX_D_PASS="$pass" ;;
    B) CTX_B_HOST="$host"; CTX_B_USER="$user"; CTX_B_DB="$db"; CTX_B_PASS="$pass" ;;
  esac
  _ctx_err "[$name] credentials loaded for pinned endpoint: $pin"
}

# Re-verify a context's pinned identity; refuse on any inconsistency.
_ctx_verify() {
  _ctx_name_ok "$1" || return 1
  local name="$1" pin host
  case "$name" in
    D) pin="$CTX_D_PIN"; host="$CTX_D_HOST" ;;
    B) pin="$CTX_B_PIN"; host="$CTX_B_HOST" ;;
  esac
  if [ -z "$pin" ]; then _ctx_err "[$name] not pinned (ctx_pin $name <label> first)"; return 1; fi
  if [ -z "$host" ]; then _ctx_err "[$name] not loaded (ctx_load $name first)"; return 1; fi
  if [ "${host%%.*}" != "$pin" ]; then _ctx_err "[$name] IDENTITY MISMATCH vs pin: refusing."; return 1; fi
  if [ -n "$CTX_D_PIN" ] && [ -n "$CTX_B_PIN" ] && [ "$CTX_D_PIN" = "$CTX_B_PIN" ]; then
    _ctx_err "IDENTITY ERROR: D and B are pinned to the SAME endpoint: refusing."; return 1
  fi
}

# ctx_run <D|B> <command...> : run with PG* env in a subshell. Stdout = child stdout ONLY.
ctx_run() {
  _ctx_no_xtrace || return 1
  local name="$1"; shift
  _ctx_verify "$name" || return 1
  local pin host user db pass
  case "$name" in
    D) pin="$CTX_D_PIN"; host="$CTX_D_HOST"; user="$CTX_D_USER"; db="$CTX_D_DB"; pass="$CTX_D_PASS" ;;
    B) pin="$CTX_B_PIN"; host="$CTX_B_HOST"; user="$CTX_B_USER"; db="$CTX_B_DB"; pass="$CTX_B_PASS" ;;
  esac
  _ctx_err "[ctx $name -> $pin] $1"
  ( export PGHOST="$host" PGUSER="$user" PGDATABASE="$db" PGPASSWORD="$pass" PGSSLMODE=require
    "$@" )
}

# ctx_prisma <D|B> <args...> : DATABASE_URL built inside the subshell; EVERY component URI-encoded.
ctx_prisma() {
  _ctx_no_xtrace || return 1
  local name="$1"; shift
  _ctx_verify "$name" || return 1
  local pin host user db pass
  case "$name" in
    D) pin="$CTX_D_PIN"; host="$CTX_D_HOST"; user="$CTX_D_USER"; db="$CTX_D_DB"; pass="$CTX_D_PASS" ;;
    B) pin="$CTX_B_PIN"; host="$CTX_B_HOST"; user="$CTX_B_USER"; db="$CTX_B_DB"; pass="$CTX_B_PASS" ;;
  esac
  _ctx_err "[ctx $name -> $pin] prisma $1"
  ( eu="$(jq -rn --arg v "$user" '$v|@uri')"
    ep="$(jq -rn --arg v "$pass" '$v|@uri')"
    ed="$(jq -rn --arg v "$db"   '$v|@uri')"
    export DATABASE_URL="postgresql://${eu}:${ep}@${host}/${ed}?sslmode=require"
    node_modules/.bin/prisma "$@" )
}

# ctx_env <D|B> <command...> : like ctx_prisma but generic: exports DATABASE_URL (every component
# URI-encoded) inside the subshell and runs ANY command (e.g. the cleanup tool via tsx, or composed
# with r2_run: `ctx_env D r2_run node_modules/.bin/tsx prisma/cleanup-agreement-probe.ts ...`;
# shell functions are inherited by the subshell, so r2_run composes cleanly).
ctx_env() {
  _ctx_no_xtrace || return 1
  local name="$1"; shift
  _ctx_verify "$name" || return 1
  local pin host user db pass
  case "$name" in
    D) pin="$CTX_D_PIN"; host="$CTX_D_HOST"; user="$CTX_D_USER"; db="$CTX_D_DB"; pass="$CTX_D_PASS" ;;
    B) pin="$CTX_B_PIN"; host="$CTX_B_HOST"; user="$CTX_B_USER"; db="$CTX_B_DB"; pass="$CTX_B_PASS" ;;
  esac
  _ctx_err "[ctx $name -> $pin] $1"
  ( eu="$(jq -rn --arg v "$user" '$v|@uri')"
    ep="$(jq -rn --arg v "$pass" '$v|@uri')"
    ed="$(jq -rn --arg v "$db"   '$v|@uri')"
    export DATABASE_URL="postgresql://${eu}:${ep}@${host}/${ed}?sslmode=require"
    "$@" )
}

# Owner-controlled ephemeral R2 injection for the Part 14 step-7 lanes.
R2CTX_ENDPOINT=""; R2CTX_BUCKET=""; R2CTX_KID=""; R2CTX_SECRET=""

r2_load() {
  _ctx_no_xtrace || return 1
  local ep bucket kid secret
  printf '%s' "[R2] endpoint URL: " >&2; read -r ep
  printf '%s' "[R2] bucket (PRIVATE document bucket): " >&2; read -r bucket
  printf '%s' "[R2] access key id (hidden): " >&2; read -r -s kid; _ctx_err ""
  printf '%s' "[R2] secret access key (hidden): " >&2; read -r -s secret; _ctx_err ""
  if [ -z "$ep" ] || [ -z "$bucket" ] || [ -z "$kid" ] || [ -z "$secret" ]; then
    _ctx_err "[R2] REFUSED: endpoint, bucket, key id and secret must all be non-empty."
    return 1
  fi
  R2CTX_ENDPOINT="$ep"; R2CTX_BUCKET="$bucket"; R2CTX_KID="$kid"; R2CTX_SECRET="$secret"
  _ctx_err "[R2] loaded (bucket: $bucket)"
}

r2_run() {
  _ctx_no_xtrace || return 1
  if [ -z "$R2CTX_ENDPOINT" ]; then _ctx_err "[R2] not loaded (r2_load first)"; return 1; fi
  _ctx_err "[R2 ctx] $1"
  ( export R2_ENDPOINT="$R2CTX_ENDPOINT" R2_BUCKET="$R2CTX_BUCKET" \
           R2_ACCESS_KEY_ID="$R2CTX_KID" R2_SECRET_ACCESS_KEY="$R2CTX_SECRET"
    "$@" )
}
