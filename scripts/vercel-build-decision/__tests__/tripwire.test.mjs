// Tripwire ancestry tests: exact-equality / merge-base --is-ancestor only (never lexical),
// squash-merge and batched-deploy coverage, and every alert condition.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkRepo, write, commit, head, sh, cleanup } from './helpers.mjs';
import { runTripwire, relevantCommits, isAccountedFor } from '../tripwire.mjs';

const repos = [];
function repo() { const r = mkRepo(); repos.push(r); return r; }
after(() => repos.forEach(cleanup));

// Linear main history; returns the SHAs.
function buildMain(r) {
  write(r, 'package.json', '{"name":"root","workspaces":["apps/*"]}');
  write(r, 'apps/customer-web/x', '1');
  write(r, 'apps/merchant-web/x', '1');
  write(r, 'apps/admin-web/x', '1');
  const c1 = commit(r, 'c1 seed');
  write(r, 'docs/a.md', 'a'); const c2 = commit(r, 'c2 docs');
  write(r, 'apps/merchant-web/y', '2'); const c3 = commit(r, 'c3 merchant');
  write(r, 'apps/admin-web/y', '2'); const c4 = commit(r, 'c4 admin');
  write(r, 'docs/b.md', 'b'); const c5 = commit(r, 'c5 docs');
  write(r, 'apps/merchant-web/z', '3'); const c6 = commit(r, 'c6 merchant');
  return { c1, c2, c3, c4, c5, c6 };
}

test('isAccountedFor: equality and ancestry only', () => {
  const r = repo(); const { c3, c6 } = buildMain(r);
  assert.equal(isAccountedFor(c6, c6, r), true, 'equal SHAs');
  assert.equal(isAccountedFor(c3, c6, r), true, 'ancestor');
  assert.equal(isAccountedFor(c6, c3, r), false, 'descendant is not accounted for by an earlier deploy');
  assert.equal(isAccountedFor('a'.repeat(40), c6, r), false, 'bogus sha');
});

test('PASS: production SHA at tip accounts for all relevant merchant commits', () => {
  const r = repo(); const { c6 } = buildMain(r);
  const res = runTripwire({ projectKey: 'merchant-web', productionSha: c6, mainRef: 'main', cwd: r });
  assert.equal(res.ok, true, JSON.stringify(res.alerts));
  assert.equal(res.alert, false);
  // c1 (root: seeds apps/merchant-web/x + package.json), c3, c6 are the relevant merchant commits.
  // c1 is correctly counted via the empty-tree base for root commits (F2 fix).
  assert.equal(res.checked, 3);
});

test('ALERT: an undeployed relevant commit (after production SHA) is flagged', () => {
  const r = repo(); const { c4, c6 } = buildMain(r);
  // Production is only at c4; the later merchant change c6 is not yet deployed.
  const res = runTripwire({ projectKey: 'merchant-web', productionSha: c4, mainRef: 'main', cwd: r });
  assert.equal(res.ok, false);
  assert.equal(res.alert, true);
  const miss = res.alerts.find((a) => a.type === 'unaccounted-relevant-commits');
  assert.ok(miss, 'expected unaccounted-relevant-commits alert');
  assert.ok(miss.commits.includes(c6));
});

test('batched deploy: production SHA covering several commits accounts for all of them', () => {
  const r = repo(); const { c4, c6 } = buildMain(r);
  // admin-web relevant commits are c1 (root seed) and c4; a later batched production deploy at
  // c6 covers both (each is an ancestor of c6).
  const res = runTripwire({ projectKey: 'admin-web', productionSha: c6, mainRef: 'main', cwd: r });
  assert.equal(res.ok, true, JSON.stringify(res.alerts));
  assert.equal(res.checked, 2);
});

test('squash merge on main is itself checked and passes when deployed', () => {
  const r = repo(); buildMain(r);
  // Emulate a squash merge: a single new main commit touching customer-web.
  write(r, 'apps/customer-web/squashed-feature.tsx', 'x');
  const squash = commit(r, 'feat(customer-web): squashed PR (#999)');
  const res = runTripwire({ projectKey: 'customer-web', productionSha: squash, mainRef: 'main', cwd: r });
  assert.equal(res.ok, true, JSON.stringify(res.alerts));
});

test('baseline limits the window to commits after it', () => {
  const r = repo(); const { c4, c6 } = buildMain(r);
  const rel = relevantCommits({ baseline: c4, mainRef: 'main', keys: ['merchant-web'], cwd: r });
  assert.equal(rel.ok, true);
  assert.deepEqual(rel.commits.map((c) => c.sha), [c6]); // only the merchant commit after c4
});

test('ALERT: production SHA not on main', () => {
  const r = repo(); const { c2 } = buildMain(r);
  sh(r, ['checkout', '-q', '-b', 'side', c2]);
  write(r, 'apps/merchant-web/side.tsx', 'x');
  const sideSha = commit(r, 'off-main commit');
  sh(r, ['checkout', '-q', 'main']);
  const res = runTripwire({ projectKey: 'merchant-web', productionSha: sideSha, mainRef: 'main', cwd: r });
  assert.equal(res.alert, true);
  assert.ok(res.alerts.some((a) => a.type === 'production-sha-not-on-main'));
});

test('ALERT: missing / invalid / absent production SHA', () => {
  const r = repo(); buildMain(r);
  assert.equal(runTripwire({ projectKey: 'merchant-web', productionSha: '', cwd: r }).alert, true);
  assert.equal(runTripwire({ projectKey: 'merchant-web', productionSha: 'nope', cwd: r }).alert, true);
  const absent = runTripwire({ projectKey: 'merchant-web', productionSha: 'a'.repeat(40), cwd: r });
  assert.equal(absent.alert, true);
  assert.ok(absent.alerts.some((a) => a.type === 'production-sha-not-in-repo'));
});

test('ALERT: invalid project key', () => {
  const r = repo(); const { c6 } = buildMain(r);
  assert.equal(runTripwire({ projectKey: 'nope', productionSha: c6, cwd: r }).alert, true);
});

// Regression for Finding 2: a genuine 2-parent --no-ff merge that introduces an app file must
// be seen. The old `diff-tree --first-parent <merge>` returned an EMPTY stream, hiding it.
test('genuine --no-ff merge introducing an app file is a relevant commit (ALERT when undeployed)', () => {
  const r = repo();
  write(r, 'package.json', '{"name":"root","workspaces":["apps/*"]}');
  write(r, 'apps/admin-web/x', '1');
  const c1 = commit(r, 'c1 seed');
  // feature branch adds an admin-web file
  sh(r, ['checkout', '-q', '-b', 'feature', c1]);
  write(r, 'apps/admin-web/newfeature.tsx', '1');
  commit(r, 'admin feature');
  // main advances with an unrelated docs commit, then merges the feature with --no-ff
  sh(r, ['checkout', '-q', 'main']);
  write(r, 'docs/note.md', '1');
  const preMerge = commit(r, 'main docs');
  sh(r, ['merge', '--no-ff', '--no-edit', '-q', 'feature']);
  const mergeSha = head(r);
  assert.notEqual(mergeSha, preMerge);

  // The merge is a first-parent main commit; it must be detected as relevant to admin-web.
  const rel = relevantCommits({ mainRef: 'main', keys: ['admin-web'], cwd: r });
  assert.equal(rel.ok, true);
  assert.ok(rel.commits.some((c) => c.sha === mergeSha), 'merge commit must be flagged relevant to admin-web');

  // Production is still at the pre-merge commit => the merge is undeployed => ALERT.
  const undeployed = runTripwire({ projectKey: 'admin-web', productionSha: preMerge, mainRef: 'main', cwd: r });
  assert.equal(undeployed.alert, true);
  assert.ok(undeployed.alerts.some((a) => a.type === 'unaccounted-relevant-commits' && a.commits.includes(mergeSha)));

  // Once production is at the merge, it PASSES.
  const deployed = runTripwire({ projectKey: 'admin-web', productionSha: mergeSha, mainRef: 'main', cwd: r });
  assert.equal(deployed.ok, true, JSON.stringify(deployed.alerts));
});

// Root-commit handling: the first commit has no parent; commitChangedRaw must diff it against
// the empty tree so its files are visible.
test('root commit files are visible to the tripwire (empty-tree base)', () => {
  const r = repo();
  write(r, 'apps/customer-web/x', '1');
  const root = commit(r, 'root commit with a customer-web file');
  const rel = relevantCommits({ mainRef: 'main', keys: ['customer-web'], cwd: r });
  assert.equal(rel.ok, true);
  assert.ok(rel.commits.some((c) => c.sha === root), 'root commit must be seen');
});
