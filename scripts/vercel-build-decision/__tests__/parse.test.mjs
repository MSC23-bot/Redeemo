// Parser fixtures: byte-string inputs, no git. Ground-truth shapes were captured from
// real `git diff --no-renames --name-status -z` output on git 2.50.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNameStatusZ } from '../parse.mjs';

const NUL = '\0';
const rec = (...pairs) => pairs.map(([s, p]) => `${s}${NUL}${p}`).join(NUL) + NUL;

test('empty input => ok, no changes (empty diff; decision layer BUILDs)', () => {
  const r = parseNameStatusZ('');
  assert.equal(r.ok, true);
  assert.deepEqual(r.paths, []);
  const rb = parseNameStatusZ(Buffer.alloc(0));
  assert.equal(rb.ok, true);
  assert.deepEqual(rb.paths, []);
});

// Exact NUL grammar: a non-empty stream must be exact (status NUL path NUL) records.
test('missing terminal NUL => anomaly (BUILD)', () => {
  const r = parseNameStatusZ('A\0docs/safe.md');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing-terminal-nul');
});

test('extra terminal NUL => anomaly (BUILD)', () => {
  const r = parseNameStatusZ('A\0docs/safe.md\0\0');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'odd-token-count');
});

test('well-formed single-record stream (exact terminal NUL) => ok', () => {
  const r = parseNameStatusZ('A\0docs/safe.md\0');
  assert.equal(r.ok, true);
  assert.deepEqual(r.paths, ['docs/safe.md']);
});

test('single add', () => {
  const r = parseNameStatusZ(rec(['A', 'apps/admin-web/x.ts']));
  assert.equal(r.ok, true);
  assert.deepEqual(r.records, [{ status: 'A', path: 'apps/admin-web/x.ts' }]);
});

test('rename decomposes into D old + A new (both paths present)', () => {
  // --no-renames output for `git mv apps/admin-web/a.ts docs/a.ts`.
  const r = parseNameStatusZ(rec(['D', 'apps/admin-web/a.ts'], ['A', 'docs/a.ts']));
  assert.equal(r.ok, true);
  assert.deepEqual(r.paths, ['apps/admin-web/a.ts', 'docs/a.ts']);
});

test('deletion of own-app file is visible as D', () => {
  const r = parseNameStatusZ(rec(['D', 'apps/admin-web/a.ts']));
  assert.equal(r.ok, true);
  assert.deepEqual(r.records, [{ status: 'D', path: 'apps/admin-web/a.ts' }]);
});

test('typechange status T is accepted', () => {
  const r = parseNameStatusZ(rec(['T', 'docs/readme.md']));
  assert.equal(r.ok, true);
  assert.deepEqual(r.records, [{ status: 'T', path: 'docs/readme.md' }]);
});

test('paths containing spaces, tabs, and newlines round-trip', () => {
  const weird = ['apps/admin-web/has space.ts', 'apps/admin-web/has\ttab.ts', 'apps/admin-web/has\nnewline.ts'];
  const r = parseNameStatusZ(rec(['A', weird[0]], ['A', weird[1]], ['A', weird[2]]));
  assert.equal(r.ok, true);
  assert.deepEqual(r.paths, weird);
});

// --- Defensive rejection cases: every one must fail-open (ok:false => caller BUILDs). ---

test('injected rename status R100 => rejected', () => {
  const raw = `R100${NUL}old${NUL}new${NUL}`;
  const r = parseNameStatusZ(raw);
  assert.equal(r.ok, false);
});

test('injected copy status C75 => rejected', () => {
  const raw = `C75${NUL}src${NUL}dst${NUL}`;
  const r = parseNameStatusZ(raw);
  assert.equal(r.ok, false);
});

test('unmerged status U => rejected', () => {
  const r = parseNameStatusZ(`U${NUL}apps/admin-web/x.ts${NUL}`);
  assert.equal(r.ok, false);
});

test('unknown status letter B => rejected', () => {
  const r = parseNameStatusZ(`B${NUL}apps/admin-web/x.ts${NUL}`);
  assert.equal(r.ok, false);
});

test('empty path token => rejected', () => {
  const r = parseNameStatusZ(`A${NUL}${NUL}`);
  assert.equal(r.ok, false);
});

test('missing path token (dangling status) => rejected', () => {
  const r = parseNameStatusZ(`A${NUL}ok${NUL}M`);
  assert.equal(r.ok, false);
});

test('garbage bytes => rejected', () => {
  const r = parseNameStatusZ('not a valid diff at all');
  assert.equal(r.ok, false);
});

test('mixed valid record followed by injected rename => rejected (misalignment caught)', () => {
  const raw = `A${NUL}apps/admin-web/x.ts${NUL}R100${NUL}old${NUL}new${NUL}`;
  const r = parseNameStatusZ(raw);
  assert.equal(r.ok, false);
});

test('non-string input => rejected', () => {
  assert.equal(parseNameStatusZ(undefined).ok, false);
  assert.equal(parseNameStatusZ(null).ok, false);
  assert.equal(parseNameStatusZ(123).ok, false);
});

test('a file literally named like a status letter is parsed as a path, not misread', () => {
  // "M" is a valid filename; in the PATH position it must be read as a path.
  const r = parseNameStatusZ(rec(['A', 'M'], ['A', 'docs/keep.md']));
  assert.equal(r.ok, true);
  assert.deepEqual(r.paths, ['M', 'docs/keep.md']);
});

// --- Byte-level (Buffer) contract: raw bytes preserved; invalid encoding => BUILD. ---

test('Buffer input with valid multi-byte UTF-8 path round-trips exactly', () => {
  // "apps/admin-web/café-☕.ts" as raw UTF-8 bytes.
  const p = 'apps/admin-web/café-☕.ts';
  const buf = Buffer.concat([Buffer.from('A\0', 'ascii'), Buffer.from(p, 'utf8'), Buffer.from('\0', 'ascii')]);
  const r = parseNameStatusZ(buf);
  assert.equal(r.ok, true);
  assert.deepEqual(r.paths, [p]);
});

test('Buffer path with INVALID UTF-8 bytes is rejected (fail-open BUILD), not silently corrupted', () => {
  // A path token containing a lone 0xFF 0xFE (not valid UTF-8). A lossy utf8 decode would
  // replace these with U+FFFD and could reclassify the path; strict decode must reject.
  const buf = Buffer.concat([
    Buffer.from('M\0', 'ascii'),
    Buffer.from([0x61, 0x70, 0x70, 0x73, 0x2f, 0xff, 0xfe]), // "apps/" + invalid bytes
    Buffer.from('\0', 'ascii'),
  ]);
  const r = parseNameStatusZ(buf);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid-path-encoding');
});

test('raw Buffer bytes are not lossily decoded before splitting (embedded high bytes in one path)', () => {
  // Two records; the first path is valid UTF-8 with a 2-byte char, ensuring byte-accurate split.
  const p1 = 'apps/merchant-web/ünicode.ts';
  const buf = Buffer.concat([
    Buffer.from('A\0', 'ascii'), Buffer.from(p1, 'utf8'), Buffer.from('\0', 'ascii'),
    Buffer.from('M\0', 'ascii'), Buffer.from('docs/x.md', 'utf8'), Buffer.from('\0', 'ascii'),
  ]);
  const r = parseNameStatusZ(buf);
  assert.equal(r.ok, true);
  assert.deepEqual(r.paths, [p1, 'docs/x.md']);
});
