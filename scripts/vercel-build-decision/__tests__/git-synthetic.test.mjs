// Synthetic git repositories driving computeDecision end-to-end: renames, deletions,
// typechanges, weird filenames, multi-app changes, and every fail-open guard.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkRepo, write, del, symlink, commit, emptyCommit, head, sh, cleanup } from './helpers.mjs';
import { computeDecision } from '../should-build.mjs';

const repos = [];
function repo() { const r = mkRepo(); repos.push(r); return r; }
after(() => repos.forEach(cleanup));

// Seed a repo with all three web apps + backend + docs so classification has real material.
function seed(r) {
  write(r, 'package.json', '{"name":"root","workspaces":["apps/*"]}');
  write(r, 'apps/customer-web/app/page.tsx', 'export default 1');
  write(r, 'apps/merchant-web/app/page.tsx', 'export default 1');
  write(r, 'apps/admin-web/app/page.tsx', 'export default 1');
  write(r, 'apps/customer-app/App.tsx', 'export default 1');
  write(r, 'src/api/index.ts', 'export const x = 1');
  write(r, 'prisma/schema.prisma', 'model X {}');
  write(r, 'docs/readme.md', '# docs');
  return commit(r, 'seed');
}

const decide = (r, prev, key) => computeDecision({ projectKey: key, prevSha: prev, headSha: head(r), cwd: r });

test('own-app file deletion builds that app, not the others', () => {
  const r = repo(); const base = seed(r);
  del(r, 'apps/admin-web/app/page.tsx');
  commit(r, 'delete admin page');
  assert.equal(decide(r, base, 'admin-web').build, true);
  assert.equal(decide(r, base, 'customer-web').build, false);
  assert.equal(decide(r, base, 'merchant-web').build, false);
});

test('rename own-app -> docs builds that app (both paths classified)', () => {
  const r = repo(); const base = seed(r);
  sh(r, ['mv', 'apps/admin-web/app/page.tsx', 'docs/moved.tsx']);
  commit(r, 'rename admin -> docs');
  const d = decide(r, base, 'admin-web');
  assert.equal(d.build, true, 'admin-web must build because its file was deleted');
  assert.equal(decide(r, base, 'customer-web').build, false);
});

test('rename docs -> own-app builds that app', () => {
  const r = repo(); const base = seed(r);
  sh(r, ['mv', 'docs/readme.md', 'apps/merchant-web/readme.md']);
  commit(r, 'rename docs -> merchant');
  assert.equal(decide(r, base, 'merchant-web').build, true);
  assert.equal(decide(r, base, 'admin-web').build, false);
});

test('cross-app rename builds BOTH affected apps, not the third', () => {
  const r = repo(); const base = seed(r);
  sh(r, ['mv', 'apps/merchant-web/app/page.tsx', 'apps/admin-web/imported.tsx']);
  commit(r, 'rename merchant -> admin');
  assert.equal(decide(r, base, 'merchant-web').build, true, 'source app deleted');
  assert.equal(decide(r, base, 'admin-web').build, true, 'dest app added');
  assert.equal(decide(r, base, 'customer-web').build, false);
});

test('typechange (file -> symlink) in own app builds that app', () => {
  const r = repo(); const base = seed(r);
  del(r, 'apps/customer-web/app/page.tsx');
  symlink(r, 'apps/customer-web/app/page.tsx', 'other');
  commit(r, 'typechange');
  assert.equal(decide(r, base, 'customer-web').build, true);
});

test('weird filenames (space/tab/newline) in own app build it; in docs are safe', () => {
  const r = repo(); const base = seed(r);
  write(r, 'apps/admin-web/has space.ts', 'x');
  write(r, 'apps/admin-web/has\ttab.ts', 'x');
  write(r, 'apps/admin-web/has\nnewline.ts', 'x');
  commit(r, 'weird admin files');
  assert.equal(decide(r, base, 'admin-web').build, true);
  assert.equal(decide(r, base, 'customer-web').build, false);

  const r2 = repo(); const base2 = seed(r2);
  write(r2, 'docs/weird name here.md', 'x');
  write(r2, 'docs/tab\there.md', 'x');
  commit(r2, 'weird docs files');
  assert.equal(decide(r2, base2, 'customer-web').build, false, 'weird docs paths still safe');
});

test('diff.renames=true config does not defeat --no-renames', () => {
  const r = repo(); const base = seed(r);
  sh(r, ['config', 'diff.renames', 'true']);
  sh(r, ['mv', 'apps/admin-web/app/page.tsx', 'docs/moved.tsx']);
  commit(r, 'rename with renames config on');
  // Even with rename detection enabled in config, our explicit --no-renames wins, so the
  // admin-web deletion is visible and triggers a build.
  assert.equal(decide(r, base, 'admin-web').build, true);
});

test('multi-app change builds every affected app', () => {
  const r = repo(); const base = seed(r);
  write(r, 'apps/customer-web/app/new.tsx', 'x');
  write(r, 'apps/merchant-web/app/new.tsx', 'x');
  commit(r, 'touch customer + merchant');
  assert.equal(decide(r, base, 'customer-web').build, true);
  assert.equal(decide(r, base, 'merchant-web').build, true);
  assert.equal(decide(r, base, 'admin-web').build, false);
});

test('root package.json / lockfile change builds all three', () => {
  const r = repo(); const base = seed(r);
  write(r, 'package.json', '{"name":"root","workspaces":["apps/*"],"changed":true}');
  write(r, 'package-lock.json', '{"lockfileVersion":3}');
  commit(r, 'dep bump');
  for (const k of ['customer-web', 'merchant-web', 'admin-web']) {
    assert.equal(decide(r, base, k).build, true, `${k} builds on lockfile change`);
  }
});

test('unknown new top-level path builds all three', () => {
  const r = repo(); const base = seed(r);
  write(r, 'infra/main.tf', 'resource {}');
  commit(r, 'add infra');
  for (const k of ['customer-web', 'merchant-web', 'admin-web']) {
    assert.equal(decide(r, base, k).build, true, `${k} builds on unknown path`);
  }
});

test('backend-only, prisma-only, docs-only, customer-app-only skip all web apps', () => {
  const cases = [
    ['src/api/new.ts', 'backend only'],
    ['prisma/migrations/2026/x.sql', 'prisma only'],
    ['docs/plan.md', 'docs only'],
    ['apps/customer-app/screens/New.tsx', 'expo only'],
  ];
  for (const [path, msg] of cases) {
    const r = repo(); const base = seed(r);
    write(r, path, 'x');
    commit(r, msg);
    for (const k of ['customer-web', 'merchant-web', 'admin-web']) {
      assert.equal(decide(r, base, k).build, false, `${k} skips for ${msg}`);
    }
  }
});

// --- Fail-open guards ---

test('PREV === HEAD (same-sha redeploy) builds', () => {
  const r = repo(); const base = seed(r);
  const d = computeDecision({ projectKey: 'customer-web', prevSha: base, headSha: base, cwd: r });
  assert.equal(d.build, true);
  assert.equal(d.reason, 'same-sha-redeploy');
});

test('empty commit (PREV != HEAD, empty tree diff) builds', () => {
  const r = repo(); const base = seed(r);
  const empty = emptyCommit(r, 'trigger rebuild');
  const d = computeDecision({ projectKey: 'customer-web', prevSha: base, headSha: empty, cwd: r });
  assert.equal(d.build, true);
  assert.equal(d.reason, 'empty-diff');
});

test('missing / invalid VERCEL_GIT_PREVIOUS_SHA builds', () => {
  const r = repo(); seed(r);
  assert.equal(computeDecision({ projectKey: 'customer-web', prevSha: undefined, cwd: r }).build, true);
  assert.equal(computeDecision({ projectKey: 'customer-web', prevSha: 'not-a-sha', cwd: r }).build, true);
  assert.equal(computeDecision({ projectKey: 'customer-web', prevSha: 'GGGG', cwd: r }).build, true);
});

test('previous SHA absent from repo (out of history) builds', () => {
  const r = repo(); seed(r);
  const bogus = 'a'.repeat(40);
  const d = computeDecision({ projectKey: 'customer-web', prevSha: bogus, headSha: head(r), cwd: r });
  assert.equal(d.build, true);
  assert.equal(d.reason, 'previous-sha-out-of-history');
});

test('invalid project key builds', () => {
  const r = repo(); const base = seed(r);
  assert.equal(computeDecision({ projectKey: 'nope', prevSha: base, headSha: head(r), cwd: r }).build, true);
  assert.equal(computeDecision({ projectKey: undefined, prevSha: base, headSha: head(r), cwd: r }).build, true);
});

test('git failure (nonexistent cwd) builds via exception/again fail-open', () => {
  const d = computeDecision({ projectKey: 'customer-web', prevSha: 'a'.repeat(40), headSha: 'b'.repeat(40), cwd: '/nonexistent/path/xyz' });
  assert.equal(d.build, true);
});

// Regression for the diff.relative + subdirectory-cwd wrong-SKIP hole (adversarial finding).
// With diff.relative=true and cwd = apps/<app> (Vercel's Root Directory), an unhardened
// `git diff` strips the apps/<app>/ prefix (own-app src/ files look like safe root paths) AND
// omits changes outside the subdir (root package.json). The fix: --no-relative + cwd pinned to
// the repo root. These assertions must all BUILD.
test('diff.relative=true + cwd=apps/<app>: own-app src/ change still BUILDs', () => {
  const r = repo();
  write(r, 'package.json', '{"name":"root","workspaces":["apps/*"]}');
  write(r, 'apps/customer-web/src/index.ts', '1');
  write(r, 'docs/a.md', '1');
  const base = commit(r, 'seed');
  sh(r, ['config', 'diff.relative', 'true']);
  write(r, 'apps/customer-web/src/index.ts', '2'); // own-app source only
  const h = commit(r, 'change own-app src');
  const subCwd = join(r, 'apps/customer-web');
  const d = computeDecision({ projectKey: 'customer-web', prevSha: base, headSha: h, cwd: subCwd });
  assert.equal(d.build, true, `must BUILD; got ${d.reason}`);
});

test('diff.relative=true + cwd=apps/<app>: root package.json change still BUILDs all', () => {
  const r = repo();
  write(r, 'package.json', '{"name":"root","workspaces":["apps/*"]}');
  write(r, 'apps/customer-web/src/index.ts', '1');
  const base = commit(r, 'seed');
  sh(r, ['config', 'diff.relative', 'true']);
  write(r, 'package.json', '{"name":"root","workspaces":["apps/*"],"x":1}'); // GLOBAL only
  const h = commit(r, 'dep bump');
  const subCwd = join(r, 'apps/customer-web');
  for (const k of ['customer-web', 'merchant-web', 'admin-web']) {
    const d = computeDecision({ projectKey: k, prevSha: base, headSha: h, cwd: subCwd });
    assert.equal(d.build, true, `${k} must BUILD on lockfile/pkg change from subdir; got ${d.reason}`);
  }
});

test('diff.relative=true + cwd=apps/<app>: docs-only change still SKIPs (fix did not over-build)', () => {
  const r = repo();
  write(r, 'package.json', '{"name":"root","workspaces":["apps/*"]}');
  write(r, 'apps/customer-web/src/index.ts', '1');
  write(r, 'docs/a.md', '1');
  const base = commit(r, 'seed');
  sh(r, ['config', 'diff.relative', 'true']);
  write(r, 'docs/b.md', 'new'); // docs only
  const h = commit(r, 'docs change');
  const subCwd = join(r, 'apps/customer-web');
  const d = computeDecision({ projectKey: 'customer-web', prevSha: base, headSha: h, cwd: subCwd });
  assert.equal(d.build, false, `docs-only must SKIP even from subdir; got ${d.reason}`);
});
