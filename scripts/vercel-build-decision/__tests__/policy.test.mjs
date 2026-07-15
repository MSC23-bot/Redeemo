// Classification policy units: per-project perspective, GLOBAL seam, safe paths,
// unknown => BUILD, empty-diff => BUILD.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPath, decide, commitIsRelevant, KNOWN_WEB_APPS } from '../policy.mjs';

test('own-app path builds only that app', () => {
  assert.equal(classifyPath('apps/merchant-web/app/page.tsx', 'merchant-web'), 'BUILD');
  assert.equal(classifyPath('apps/merchant-web/app/page.tsx', 'customer-web'), 'SAFE');
  assert.equal(classifyPath('apps/merchant-web/app/page.tsx', 'admin-web'), 'SAFE');
});

test('sibling web app is safe for the others', () => {
  assert.equal(classifyPath('apps/admin-web/x.ts', 'customer-web'), 'SAFE');
  assert.equal(classifyPath('apps/customer-app/App.tsx', 'customer-web'), 'SAFE'); // Expo app
});

test('GLOBAL install seam builds all three', () => {
  for (const key of KNOWN_WEB_APPS) {
    assert.equal(classifyPath('package.json', key), 'BUILD');
    assert.equal(classifyPath('package-lock.json', key), 'BUILD');
    assert.equal(classifyPath('.npmrc', key), 'BUILD');
    assert.equal(classifyPath('.nvmrc', key), 'BUILD');
  }
});

test('backend, prisma, docs, tests, configs are safe for all web apps', () => {
  const safe = [
    'src/api/subscription/cycle.ts',
    'prisma/schema.prisma',
    'prisma/migrations/2026_x/migration.sql',
    'prisma.config.ts',
    'tests/integration/foo.test.ts',
    'vitest.config.ts',
    'tsconfig.json',
    'tsconfig.build.json',
    'Procfile',
    'docs/PROJECT-STATE.md',
    'context/notes.md',
    '.claude/hooks/pre-bash/01-git-safety.sh',
    '.github/workflows/ci.yml',
    '.gitignore',
    '.env.example',
    'CLAUDE.md',
    'README.md',
  ];
  for (const key of KNOWN_WEB_APPS) {
    for (const p of safe) assert.equal(classifyPath(p, key), 'SAFE', `${p} for ${key}`);
  }
});

test('unknown top-level file or dir builds all three (fail-open)', () => {
  for (const key of KNOWN_WEB_APPS) {
    assert.equal(classifyPath('infra/main.tf', key), 'BUILD');
    assert.equal(classifyPath('Dockerfile', key), 'BUILD');
    assert.equal(classifyPath('some-new-root-file.txt', key), 'BUILD');
    assert.equal(classifyPath('apps/', key), 'BUILD');
    assert.equal(classifyPath('apps/loosefile.txt', key), 'BUILD');
    assert.equal(classifyPath('apps/brand-new-app/x.ts', key), 'BUILD'); // unclassified app dir
  }
});

test('malformed inputs classify BUILD', () => {
  assert.equal(classifyPath('', 'customer-web'), 'BUILD');
  assert.equal(classifyPath(undefined, 'customer-web'), 'BUILD');
  assert.equal(classifyPath('src/x.ts', 'not-a-project'), 'BUILD');
  assert.equal(classifyPath('src/x.ts', undefined), 'BUILD');
});

test('decide: empty path list => BUILD (empty-diff)', () => {
  const d = decide('customer-web', []);
  assert.equal(d.build, true);
  assert.equal(d.reason, 'empty-diff');
});

test('decide: all-safe => SKIP', () => {
  const d = decide('customer-web', ['docs/a.md', 'src/x.ts', 'apps/admin-web/y.ts']);
  assert.equal(d.build, false);
  assert.equal(d.reason, 'all-paths-safe');
});

test('decide: one own-app path among safe => BUILD', () => {
  const d = decide('customer-web', ['docs/a.md', 'apps/customer-web/app/page.tsx']);
  assert.equal(d.build, true);
  assert.ok(d.triggers.includes('apps/customer-web/app/page.tsx'));
});

test('decide: rename own-app -> docs (both paths) => BUILD for that app', () => {
  // The parser yields both the deleted own-app path and the added docs path.
  const paths = ['apps/admin-web/a.ts', 'docs/a.ts'];
  assert.equal(decide('admin-web', paths).build, true); // own-app deletion triggers
  assert.equal(decide('customer-web', paths).build, false); // safe for others
});

test('commitIsRelevant matches decide for non-empty diffs', () => {
  assert.equal(commitIsRelevant('merchant-web', ['apps/merchant-web/x.ts']), true);
  assert.equal(commitIsRelevant('merchant-web', ['docs/x.md']), false);
  assert.equal(commitIsRelevant('merchant-web', []), false); // empty commit is not "relevant"
});
