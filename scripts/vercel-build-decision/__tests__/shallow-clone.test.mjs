// Depth-10 shallow-clone simulations matching Vercel's `git clone --depth=10`.
// Verifies: out-of-depth baseline builds; in-depth safe span skips; the "accumulated skips"
// baseline (PREV = last SUCCESSFUL deployment) correctly sees every change since then.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkRepo, write, commit, sh, cleanup } from './helpers.mjs';
import { computeDecision } from '../should-build.mjs';
import { objectExists } from '../git.mjs';

const temps = [];
after(() => temps.forEach(cleanup));

function seed(r) {
  write(r, 'package.json', '{"name":"root","workspaces":["apps/*"]}');
  write(r, 'apps/customer-web/app/page.tsx', '1');
  write(r, 'apps/merchant-web/app/page.tsx', '1');
  write(r, 'apps/admin-web/app/page.tsx', '1');
  write(r, 'src/api/index.ts', '1');
  write(r, 'docs/readme.md', '1');
  return commit(r, 'c1 seed');
}

function shallowClone(origin, depth = 10) {
  const dest = mkdtempSync(join(tmpdir(), 'vbd-shallow-'));
  temps.push(dest);
  const r = spawnSync('git', ['clone', '--quiet', `--depth=${depth}`, `file://${origin}`, dest], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`shallow clone failed: ${r.stderr}`);
  return dest;
}

test('depth-10 clone: out-of-depth baseline forces BUILD; in-depth safe span SKIPs', () => {
  const origin = mkRepo(); temps.push(origin);
  const shas = [seed(origin)];
  // 14 more commits (total 15). Keep them docs-only so a safe span is possible.
  for (let i = 2; i <= 15; i++) {
    write(origin, `docs/note-${i}.md`, `note ${i}`);
    shas.push(commit(origin, `c${i} docs`));
  }
  const clone = shallowClone(origin, 10);
  const tip = shas[14]; // c15

  // The very first commits are outside the depth-10 window.
  const outOfDepth = shas[2]; // c3
  assert.equal(objectExists(outOfDepth, clone), false, 'c3 should be pruned by depth-10');
  const dOut = computeDecision({ projectKey: 'customer-web', prevSha: outOfDepth, headSha: tip, cwd: clone });
  assert.equal(dOut.build, true);
  assert.equal(dOut.reason, 'previous-sha-out-of-history');

  // A recent in-depth baseline whose span to tip is docs-only => SKIP.
  const inDepth = shas[13]; // c14, present in the depth-10 window
  assert.equal(objectExists(inDepth, clone), true, 'c14 should be within depth-10');
  const dIn = computeDecision({ projectKey: 'customer-web', prevSha: inDepth, headSha: tip, cwd: clone });
  assert.equal(dIn.build, false, 'docs-only span should skip');
  assert.equal(dIn.reason, 'all-paths-safe');
});

test('accumulated skips: baseline spanning several commits, one touching an app, BUILDs that app', () => {
  const origin = mkRepo(); temps.push(origin);
  const shas = [seed(origin)];
  // c2..c8 well within depth-10.
  write(origin, 'docs/a.md', 'a'); shas.push(commit(origin, 'c2 docs'));       // idx2
  write(origin, 'docs/b.md', 'b'); shas.push(commit(origin, 'c3 docs'));       // idx3
  write(origin, 'src/api/more.ts', '2'); shas.push(commit(origin, 'c4 backend')); // idx4
  write(origin, 'apps/merchant-web/app/x.tsx', '2'); shas.push(commit(origin, 'c5 merchant')); // idx5
  write(origin, 'docs/c.md', 'c'); shas.push(commit(origin, 'c6 docs'));       // idx6
  const clone = shallowClone(origin, 10);
  const tip = shas[6]; // c6

  // Baseline = c3 (last successful deploy). Span c4..c6 includes the merchant change (c5).
  const baseline = shas[3];
  assert.equal(objectExists(baseline, clone), true);
  // merchant-web must build (its file changed within the accumulated span)...
  assert.equal(computeDecision({ projectKey: 'merchant-web', prevSha: baseline, headSha: tip, cwd: clone }).build, true);
  // ...but customer-web and admin-web see only docs+backend across the same span => SKIP.
  assert.equal(computeDecision({ projectKey: 'customer-web', prevSha: baseline, headSha: tip, cwd: clone }).build, false);
  assert.equal(computeDecision({ projectKey: 'admin-web', prevSha: baseline, headSha: tip, cwd: clone }).build, false);
});

test('accumulated skips: all-safe span across many commits SKIPs', () => {
  const origin = mkRepo(); temps.push(origin);
  const shas = [seed(origin)];
  for (let i = 2; i <= 6; i++) { write(origin, `src/gen-${i}.ts`, `${i}`); shas.push(commit(origin, `c${i} backend`)); }
  const clone = shallowClone(origin, 10);
  const tip = shas[5];
  const baseline = shas[1];
  for (const k of ['customer-web', 'merchant-web', 'admin-web']) {
    assert.equal(computeDecision({ projectKey: k, prevSha: baseline, headSha: tip, cwd: clone }).build, false, `${k} skips all-backend span`);
  }
});
