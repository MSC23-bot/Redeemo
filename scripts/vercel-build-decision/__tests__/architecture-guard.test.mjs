// Executable architecture guard for the SAFE path policy.
//
// The policy classifies root `src/**`, `prisma/**`, sibling apps (incl. `apps/customer-app`),
// and the other web apps as SAFE to ignore for a given web project. That is only valid while
// the web apps have NO build-time dependency reaching into those locations. This test proves
// that invariant against the live repo and FAILS if any web app acquires such a dependency
// (a relative import escaping its own directory, or a workspace/@redeemo/file package dep).
// If it ever fails, either remove the coupling or narrow the SAFE policy (add that path as a
// BUILD trigger) -- do not weaken this test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { repoRoot } from '../git.mjs';
import { KNOWN_WEB_APPS, classifyPath } from '../policy.mjs';

const REPO = repoRoot(process.cwd()) || process.cwd();
const SRC_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.turbo', '.vercel']);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, out);
    } else if (e.isFile()) {
      const dot = e.name.lastIndexOf('.');
      if (dot >= 0 && SRC_EXT.has(e.name.slice(dot))) out.push(full);
    }
  }
  return out;
}

function stripComments(src) {
  // Remove block comments, then line comments (but not the // inside http:// or a string).
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

const SPEC_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
];

function specifiers(src) {
  const clean = stripComments(src);
  const found = new Set();
  for (const re of SPEC_PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(clean)) !== null) found.add(m[1]);
  }
  return [...found];
}

for (const app of KNOWN_WEB_APPS) {
  test(`apps/${app}: no build-reachable import couples to a SAFE-classified location`, () => {
    const appDir = resolve(REPO, 'apps', app);
    if (!existsSync(appDir)) return; // app not present in this checkout
    const files = walk(appDir);
    assert.ok(files.length > 0, `expected source files under apps/${app}`);
    const violations = [];
    for (const file of files) {
      const dir = resolve(file, '..');
      for (const spec of specifiers(readFileSync(file, 'utf8'))) {
        if (!spec.startsWith('.')) continue; // bare specifiers handled by the package.json test
        const target = resolve(dir, spec);
        const relToApp = relative(appDir, target);
        const escapes = relToApp === '..' || relToApp.startsWith(`..${sep}`) || relToApp.startsWith('..');
        if (!escapes) continue; // stays inside the app: fine
        // It escapes the app. That is a VIOLATION only if the target classifies SAFE for this
        // app (i.e. a change there would be SKIPPED). If it classifies BUILD (e.g. the GLOBAL
        // tests/fixtures/ seam or the root install seam), the build decision already covers it.
        const targetRepoRel = relative(REPO, target).split(sep).join('/');
        if (classifyPath(targetRepoRel, app) === 'SAFE') {
          violations.push(`${relative(REPO, file)} -> ${spec}  (target ${targetRepoRel} is SAFE-classified)`);
        }
      }
    }
    assert.deepEqual(
      violations,
      [],
      `apps/${app} has ${violations.length} import(s) into a SAFE-classified location (wrong-SKIP risk):\n  ${violations.join('\n  ')}\nEither remove the coupling or make that path a BUILD trigger in policy.mjs.`,
    );
  });

  test(`apps/${app}: package.json has no workspace/@redeemo/file dependency`, () => {
    const pkgPath = resolve(REPO, 'apps', app, 'package.json');
    if (!existsSync(pkgPath)) return;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const bad = Object.entries(deps).filter(
      ([name, ver]) =>
        String(ver).startsWith('file:') ||
        String(ver).startsWith('workspace:') ||
        (name.startsWith('@redeemo/') && name !== pkg.name),
    );
    assert.deepEqual(
      bad,
      [],
      `apps/${app} declares a cross-workspace dependency that would couple it to a SAFE location: ${JSON.stringify(bad)}`,
    );
  });
}
