#!/bin/bash
# rehearsal-context.test.sh : committed tests for docs/runbooks/rehearsal-context.sh and (with
# --with-db) docs/runbooks/logical-manifest.sql. Run under bash OR zsh:
#   bash tests/shell/rehearsal-context.test.sh [--with-db]
#   zsh  tests/shell/rehearsal-context.test.sh [--with-db]
# DB mode uses a self-created DISPOSABLE local PostgreSQL cluster only (initdb into a temp dir,
# torn down afterward). Never touches Neon, R2, or any shared environment. Exits non-zero on any
# failure. All assertions avoid printing secret marker values (only match/no-match).
set -u
SHELL_NAME="${ZSH_VERSION:+zsh}${ZSH_VERSION:-bash}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WRAP="$ROOT/docs/runbooks/rehearsal-context.sh"
MANIFEST="$ROOT/docs/runbooks/logical-manifest.sql"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf 'ok %s - %s\n' "$((PASS+FAIL))" "$1"; }
bad()  { FAIL=$((FAIL+1)); printf 'not ok %s - %s\n' "$((PASS+FAIL))" "$1"; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (want '$3' got '$2')"; fi; }

TMP="$(mktemp -d /tmp/rcxtest.XXXXXX)"
trap 'rm -rf "$TMP"; [ -n "${PGDATA_DIR:-}" ] && "$PGBIN/pg_ctl" -D "$PGDATA_DIR" stop -m fast >/dev/null 2>&1; [ -n "${PGDATA_DIR:-}" ] && rm -rf "$PGDATA_DIR"' EXIT

# shellcheck disable=SC1090
source "$WRAP"

# ---- 1. clean stdout: ctx_run stdout is EXACTLY the child stdout; banner on stderr ----
ctx_pin D localhost >/dev/null 2>&1
ctx_load D >/dev/null 2>&1 <<'EOF'
localhost
u1
db1
p1
EOF
out="$(ctx_run D /bin/echo hello 2>"$TMP/err1")"
check "clean stdout (child only)" "$out" "hello"
if grep -q "ctx D" "$TMP/err1"; then ok "banner on stderr"; else bad "banner on stderr"; fi

# ---- 2. invalid context names refused everywhere ----
ctx_pin X label-aaaaaaa >/dev/null 2>&1; check "ctx_pin X refused" "$?" "1"
ctx_load X >/dev/null 2>&1 </dev/null; check "ctx_load X refused" "$?" "1"
ctx_run X /bin/true >/dev/null 2>&1; check "ctx_run X refused" "$?" "1"
ctx_prisma X --version >/dev/null 2>&1; check "ctx_prisma X refused" "$?" "1"

# ---- 3. unpinned load refused ----
CTX_B_PIN=""; CTX_B_HOST=""
ctx_load B >/dev/null 2>&1 </dev/null; check "unpinned ctx_load B refused" "$?" "1"

# ---- 4. pin validation ----
ctx_pin B short >/dev/null 2>&1; check "short pin refused" "$?" "1"
ctx_pin B has.dots.zz >/dev/null 2>&1; check "dotted pin refused" "$?" "1"
ctx_pin B "has slash/x" >/dev/null 2>&1; check "slashed pin refused" "$?" "1"

# ---- 5. distinct pins enforced ----
ctx_pin B localhost >/dev/null 2>&1; check "B pin == D pin refused" "$?" "1"
ctx_pin B otherhost >/dev/null 2>&1; check "B distinct pin accepted" "$?" "0"

# ---- 6. swapped load refused (D creds cannot land on B's endpoint and vice versa) ----
ctx_load B >/dev/null 2>&1 <<'EOF'
localhost
EOF
check "B load with D-endpoint host refused" "$?" "1"

# ---- 7. same-endpoint corruption refused at verify time ----
CTX_B_PIN="localhost"; CTX_B_HOST="localhost"; CTX_B_USER=u; CTX_B_DB=d; CTX_B_PASS=p
ctx_run B /bin/true >/dev/null 2>&1; check "same-endpoint D/B verify refused" "$?" "1"
CTX_B_PIN="otherhost"; CTX_B_HOST=""; CTX_B_USER=""; CTX_B_DB=""; CTX_B_PASS=""

# ---- 8. xtrace fail-closed: refuse BEFORE reading; marker secret never appears ----
MARKER="XTRACE-MARKER-SECRET-9271"
set -x
{ ctx_load D <<EOF
localhost
u1
db1
$MARKER
EOF
} >"$TMP/x_out" 2>"$TMP/x_err"; xload=$?
ctx_run D /bin/true >>"$TMP/x_out" 2>>"$TMP/x_err"; xrun=$?
ctx_pin B pin-aaaaaaaa >>"$TMP/x_out" 2>>"$TMP/x_err"; xpin=$?
r2_load >>"$TMP/x_out" 2>>"$TMP/x_err" </dev/null; xr2l=$?
r2_run /bin/true >>"$TMP/x_out" 2>>"$TMP/x_err"; xr2r=$?
set +x
check "xtrace: ctx_load refused" "$xload" "1"
check "xtrace: ctx_run refused" "$xrun" "1"
check "xtrace: ctx_pin refused" "$xpin" "1"
check "xtrace: r2_load refused" "$xr2l" "1"
check "xtrace: r2_run refused" "$xr2r" "1"
if grep -q "$MARKER" "$TMP/x_out" "$TMP/x_err" 2>/dev/null; then bad "xtrace: marker secret leaked"; else ok "xtrace: marker secret never in stdout/stderr"; fi

# ---- 9. special-character password preserved, never printed ----
SPECIAL='p@ss w:o/r?d#1&x='
ctx_load D >/dev/null 2>"$TMP/err9" <<EOF
localhost
us:er
d b
$SPECIAL
EOF
check "special-char load accepted" "$?" "0"
got="$(ctx_run D /bin/sh -c 'printf %s "$PGPASSWORD"' 2>/dev/null)"
if [ "$got" = "$SPECIAL" ]; then ok "special-char password preserved (value not printed)"; else bad "special-char password mismatch"; fi
if grep -qF "$SPECIAL" "$TMP/err9"; then bad "password appeared on stderr"; else ok "password absent from stderr"; fi

# ---- 10. DATABASE_URL: every component URI-encoded; env-only; argv clean ----
mkdir -p "$TMP/node_modules/.bin"
cat > "$TMP/node_modules/.bin/prisma" <<'EOF'
#!/bin/bash
printf '%s' "$DATABASE_URL" > "$STUB_OUT"
case "$*" in *postgresql://*) echo ARGV-LEAK; exit 1;; esac
EOF
chmod +x "$TMP/node_modules/.bin/prisma"
( cd "$TMP" && STUB_OUT="$TMP/url.txt" ctx_prisma D migrate deploy >/dev/null 2>&1 )
url="$(cat "$TMP/url.txt" 2>/dev/null)"
case "$url" in
  postgresql://us%3Aer:p%40ss%20w%3Ao%2Fr%3Fd%231%26x%3D@localhost/d%20b?sslmode=require) ok "DATABASE_URL fully encoded (user+pass+db)";;
  *) bad "DATABASE_URL encoding wrong";;
esac

# ---- 10b. ctx_env: generic DATABASE_URL env-only runner; composes with r2_run ----
( cd "$TMP" && STUB_OUT="$TMP/url2.txt" ctx_env D /bin/bash -c 'printf %s "$DATABASE_URL" > "$STUB_OUT"' >/dev/null 2>&1 )
url2="$(cat "$TMP/url2.txt" 2>/dev/null)"
if [ "$url2" = "$url" ]; then ok "ctx_env DATABASE_URL matches ctx_prisma encoding"; else bad "ctx_env DATABASE_URL mismatch"; fi
ctx_env X /bin/true >/dev/null 2>&1; check "ctx_env X refused" "$?" "1"
R2CTX_ENDPOINT="https://x.invalid"; R2CTX_BUCKET=b; R2CTX_KID=k; R2CTX_SECRET=s
both="$(ctx_env D r2_run /bin/bash -c '[ -n "$DATABASE_URL" ] && [ -n "$R2_SECRET_ACCESS_KEY" ] && echo BOTH' 2>/dev/null)"
check "ctx_env + r2_run composition injects both envs" "$both" "BOTH"
R2CTX_ENDPOINT=""; R2CTX_BUCKET=""; R2CTX_KID=""; R2CTX_SECRET=""

# ---- 11. R2 empties + unloaded refusals ----
r2_load >/dev/null 2>&1 <<'EOF'
https://x.invalid
bucket1

EOF
check "R2 empty secret refused" "$?" "1"
R2CTX_ENDPOINT=""
r2_run /bin/true >/dev/null 2>&1; check "r2_run unloaded refused" "$?" "1"

# ---- 12. empty user/db/pass refused ----
ctx_pin D localhost >/dev/null 2>&1
ctx_load D >/dev/null 2>&1 <<'EOF'
localhost


x
EOF
check "empty user/db refused" "$?" "1"

# ---- DB mode: manifest matrix + wrapper-captured manifests (D==B, banner-free) ----
if [ "${1:-}" = "--with-db" ]; then
  PGBIN=""
  for c in /opt/homebrew/opt/postgresql@16/bin /usr/lib/postgresql/16/bin /usr/local/opt/postgresql@16/bin; do
    [ -x "$c/initdb" ] && PGBIN="$c" && break
  done
  if [ -z "$PGBIN" ]; then
    bad "--with-db requested but no postgresql@16 initdb found"
  else
    PGDATA_DIR="$(mktemp -d /tmp/rcxpg.XXXXXX)"
    PORT=$(( 50000 + RANDOM % 5000 ))
    "$PGBIN/initdb" -D "$PGDATA_DIR" -U "$USER" -A trust >/dev/null 2>&1
    "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -o "-p $PORT -c listen_addresses=localhost" -l "$PGDATA_DIR/log" start >/dev/null 2>&1
    sleep 1
    "$PGBIN/createdb" -h localhost -p "$PORT" ctxd
    SEED='CREATE TABLE t_a(id int, v text, n text, b bytea); CREATE TABLE t_empty(id int); CREATE TABLE "Weird ""Name"(x int);
          INSERT INTO t_a VALUES (1,'\''hello'\'','\''nn'\'','\''\x01'\''),(2,'\''world'\'',NULL,'\''\x02'\'');'
    "$PGBIN/psql" -h localhost -p "$PORT" -X -q -d ctxd -c "$SEED"
    ctx_pin D localhost >/dev/null 2>&1 || true
    ctx_load D >/dev/null 2>&1 <<EOF
localhost
$USER
ctxd
trustpass
EOF
    # Clean-capture regression (finding 1): the wrapper-captured manifest must be byte-identical
    # to a DIRECT psql capture (no banner in stdout), and two wrapper captures must be identical.
    # (Distinct-endpoint D/B semantics are covered by the non-DB pin/refusal tests above; a second
    # resolvable local hostname is not portably available on macOS, so the DB-mode equality check
    # uses two D captures + a direct capture instead.)
    RUN=(env PGPORT="$PORT" PGSSLMODE=disable "$PGBIN/psql" -X -q -tA -v ON_ERROR_STOP=1 -f "$MANIFEST")
    ctx_run D "${RUN[@]}" > "$TMP/mD.txt" 2>"$TMP/mDerr"
    ctx_run D "${RUN[@]}" > "$TMP/mD2.txt" 2>"$TMP/mD2err"
    "$PGBIN/psql" -h localhost -p "$PORT" -X -q -tA -v ON_ERROR_STOP=1 -d ctxd -f "$MANIFEST" > "$TMP/mDirect.txt"
    if diff -q "$TMP/mD.txt" "$TMP/mD2.txt" >/dev/null && diff -q "$TMP/mD.txt" "$TMP/mDirect.txt" >/dev/null; then ok "wrapper-captured manifest banner-free and byte-identical to direct capture"; else bad "wrapper capture differs (banner leak?)"; fi
    if grep -q "ctx D" "$TMP/mD.txt"; then bad "banner leaked into manifest stdout"; else ok "no banner in manifest file"; fi
    P=("$PGBIN/psql" -h localhost -p "$PORT" -X -q -d ctxd)
    m(){ "$PGBIN/psql" -h localhost -p "$PORT" -X -q -tA -v ON_ERROR_STOP=1 -d ctxd -f "$MANIFEST"; }
    m > "$TMP/base.txt"
    grep -q '^t_empty|0|EMPTY$' "$TMP/base.txt" && ok "empty table asserted" || bad "empty table asserted"
    "${P[@]}" -c "BEGIN; DELETE FROM t_a; INSERT INTO t_a VALUES (2,'world',NULL,'\x02'),(1,'hello','nn','\x01'); COMMIT;"
    m > "$TMP/r.txt"; diff -q "$TMP/base.txt" "$TMP/r.txt" >/dev/null && ok "physical-order invariant" || bad "physical-order invariant"
    "${P[@]}" -c "UPDATE t_a SET v='X' WHERE id=1;"; m > "$TMP/r.txt"; diff -q "$TMP/base.txt" "$TMP/r.txt" >/dev/null && bad "changed row detected" || ok "changed row detected"
    "${P[@]}" -c "UPDATE t_a SET v='hello' WHERE id=1;"
    "${P[@]}" -c "INSERT INTO t_a SELECT * FROM t_a WHERE id=1;"; m > "$TMP/r.txt"; diff -q "$TMP/base.txt" "$TMP/r.txt" >/dev/null && bad "duplicate row detected" || ok "duplicate row detected"
    "${P[@]}" -c "DELETE FROM t_a WHERE ctid IN (SELECT ctid FROM t_a WHERE id=1 LIMIT 1);"
    "${P[@]}" -c "UPDATE t_a SET n=NULL WHERE id=1;"; m > "$TMP/r.txt"; diff -q "$TMP/base.txt" "$TMP/r.txt" >/dev/null && bad "NULL flip detected" || ok "NULL flip detected"
    "${P[@]}" -c "UPDATE t_a SET n='nn' WHERE id=1;"
    "${P[@]}" -c "UPDATE t_a SET b='\x03' WHERE id=2;"; m > "$TMP/r.txt"; diff -q "$TMP/base.txt" "$TMP/r.txt" >/dev/null && bad "bytea change detected" || ok "bytea change detected"
    "${P[@]}" -c "UPDATE t_a SET b='\x02' WHERE id=2;"
    "${P[@]}" -c "CREATE TABLE t_new(y int);"; m > "$TMP/r.txt"; diff -q "$TMP/base.txt" "$TMP/r.txt" >/dev/null && bad "added table detected" || ok "added table detected"
    "${P[@]}" -c "DROP TABLE t_new;"
    "${P[@]}" -c "DROP TABLE t_empty;"; m > "$TMP/r.txt"; diff -q "$TMP/base.txt" "$TMP/r.txt" >/dev/null && bad "removed table detected" || ok "removed table detected"
  fi
fi

printf '# %s: %s passed, %s failed\n' "$SHELL_NAME" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
