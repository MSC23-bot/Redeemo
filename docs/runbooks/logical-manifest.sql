-- logical-manifest.sql : deterministic LOGICAL-DRIFT evidence generator (rev 2026-07-19g)
--
-- WHAT THIS IS: for every base table in schema public (INCLUDING "_prisma_migrations"), emits one
-- line `<table>|<row_count>|<digest>` where digest = md5 over the table's per-row md5 hashes
-- aggregated in hash order. Two runs on logically identical data produce identical output; any
-- changed / duplicated / added / removed row, NULL flip, bytea change, or added/removed table
-- changes the output.
--
-- WHAT THIS IS NOT: cryptographic proof or byte equivalence. md5 here is a drift detector, not a
-- security primitive; the comparison is DETERMINISTIC LOGICAL-DRIFT EVIDENCE on identical DDL
-- (identical DDL is separately guaranteed by the fail-closed identity preflight run alongside).
--
-- SAFETY: read-only SELECTs; prints table names, counts and digests ONLY: never row contents.
--
-- DETERMINISM PINS (representation-sensitive session settings): set below so text renderings of
-- timestamps, floats, bytea and intervals cannot vary between runs/hosts. Output rows are ordered
-- by table_name under collation "C" (locale-independent), and \gexec preserves that order.
--
-- INVOCATION (header-free, tuples-only, fail-closed):
--   psql <connection-via-PG*-env> -X -q -tA -v ON_ERROR_STOP=1 -f logical-manifest.sql > m.txt
-- COMPARISON (the fail-closed gate: diff exits non-zero on ANY table-set/count/content mismatch):
--   diff -u baseline.txt m.txt
--
\set ON_ERROR_STOP on
\pset pager off

SET TimeZone = 'UTC';
SET DateStyle = 'ISO, YMD';
SET bytea_output = 'hex';
SET extra_float_digits = 3;
SET IntervalStyle = 'postgres';

SELECT format(
  'SELECT %L || ''|'' || count(*)::text || ''|'' || coalesce(md5(string_agg(h, '''' ORDER BY h)), ''EMPTY'') FROM (SELECT md5(t::text) AS h FROM %I.%I t) s',
  table_name, table_schema, table_name)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name COLLATE "C" \gexec
