# Insights & Reports - isolated local Postgres test DB (PR-A)

PR-A's real-DB integration tests (aggregation, reconciliation, London/DST bucketing,
branch-scope, cleanliness, lifecycle, gate) need a **real** Postgres - but they must
**never** touch shared Neon staging, Railway, or any production-like DB, and must not
seed `isTestData=false` activity anywhere shared. This runbook stands up a **disposable,
loopback-only, keg-only** local Postgres for that purpose.

Owner-approved approach (2026-06-27): Homebrew `postgresql@16` keg, kept **keg-only**
(not `brew link`-ed, no `brew services`, no launch agent). Started only as a **transient**
process against a **gitignored** repo-local data dir on a **non-default port**.

## Invariants (do not weaken)

- The integration suite uses **`TEST_DATABASE_URL`** only. The persistent `.env`
  `DATABASE_URL` (Neon) is **never** modified or reused as a test target.
- Before any migrate or fixture insert, the target host is **proven loopback**
  (`127.0.0.1`) and the db name `redeemo_insights_test`; a remote host aborts.
- `isTestData=false` fixtures are allowed **only inside this disposable DB**.
- The integration tests do **not** replace raw-SQL verification with mocked Prisma.
- Connection strings / credentials stay out of code, commits, PR bodies, logs.

## One-time install (keg-only)

```bash
brew install postgresql@16          # 16.x, bottled, keg-only
brew unlink postgresql@16           # ensure NO global PATH symlinks (keg-only)
# never: brew link postgresql@16 ; brew services start postgresql@16
```

Binaries live at `/opt/homebrew/opt/postgresql@16/bin` (referenced explicitly; not on PATH).

## Bring up the disposable cluster

```bash
PG=/opt/homebrew/opt/postgresql@16/bin
"$PG/initdb" -D .pgtest/data -U postgres -E UTF8 --auth-local=trust --auth-host=trust
cat >> .pgtest/data/postgresql.conf <<'CONF'
port = 54329
listen_addresses = '127.0.0.1'
unix_socket_directories = '/ABSOLUTE/REPO/PATH/.pgtest'
fsync = off
synchronous_commit = off
full_page_writes = off
CONF
"$PG/pg_ctl" -D .pgtest/data -l .pgtest/server.log -w start
"$PG/createdb" -h 127.0.0.1 -p 54329 -U postgres redeemo_insights_test
# .env.test (gitignored): TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/redeemo_insights_test
```

`.pgtest/` and `.env.test` are gitignored - never commit them.

## Migrate the isolated DB only (loopback-guarded)

```bash
set -a; . ./.env.test; set +a
# proves loopback before migrating; aborts on a remote host
DATABASE_URL="$TEST_DATABASE_URL" fnm exec --using=24 -- node -e '
  const u=new URL(process.env.DATABASE_URL);
  if(!["127.0.0.1","localhost"].includes(u.hostname)) { console.error("ABORT not loopback"); process.exit(1); }'
DATABASE_URL="$TEST_DATABASE_URL" fnm exec --using=24 -- npx prisma migrate deploy
```

`prisma.config.ts` reads `process.env.DATABASE_URL`; `dotenv` does **not** override an
already-set env var, so the inline loopback value wins and `.env` is untouched. The
backend runs on Node 24 (`fnm exec --using=24`).

## Run the tests

```bash
# unit tests (mocked Prisma, no DB) - unchanged, DB-independent
fnm exec --using=24 -- npm run test:unit

# insights real-DB integration tests (loopback test DB only)
DATABASE_URL="$TEST_DATABASE_URL" fnm exec --using=24 -- \
  npx vitest run --project integration tests/api/merchant/insights
```

A vitest setup file for the insights integration tests asserts `DATABASE_URL` is loopback
and refuses to run otherwise - so these tests can never reach Neon/Railway.

## Teardown

```bash
PG=/opt/homebrew/opt/postgresql@16/bin
"$PG/pg_ctl" -D .pgtest/data -m fast stop
"$PG/pg_isready" -h 127.0.0.1 -p 54329   # expect: no response / not accepting
rm -rf .pgtest .env.test
# the postgresql@16 keg may remain installed for repeatable future runs
```

## CI (future)

CI currently runs `test:unit` only. When integration tests move to CI, provision a
Postgres **service container** (GitHub Actions `services: postgres:16`) and set
`TEST_DATABASE_URL` to it - never a shared/staging DB. Tracked with the repo's existing
"PR2 dedicated local Postgres" note in `vitest.config.ts`.
