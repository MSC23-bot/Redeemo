// Real Redeemo-history fixtures. Runs against the actual repository this test executes in.
// Two layers:
//   (a) PINNED anchors: specific main SHAs cited in the cost audit, asserted end-to-end.
//   (b) DISCOVERED fixtures: scan recent first-parent main history, bucket single-parent
//       commits by change shape, and assert the first real example of each category. The
//       SHA used is logged so a reviewer can audit it.
// Every assertion is guarded: if the repo/ref/fixture is unavailable (e.g. a shallow CI
// checkout), the sub-test skips rather than fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { git, objectExists, revParse, repoRoot } from '../git.mjs';
import { parseNameStatusZ } from '../parse.mjs';
import { classifyPath, KNOWN_WEB_APPS, KNOWN_APPS } from '../policy.mjs';
import { evaluateDiff } from '../should-build.mjs';

const REPO = repoRoot(process.cwd()) || process.cwd();
const MAIN = revParse('origin/main', REPO) ? 'origin/main' : (revParse('main', REPO) ? 'main' : null);

function firstParentOf(sha) {
  const r = git(['show', '--no-patch', '--format=%P', sha], REPO);
  if (!r.ok) return null;
  const parents = r.stdout.trim().split(/\s+/).filter(Boolean);
  return parents.length === 1 ? parents[0] : null; // single-parent only, for clean two-dot diff
}

function pathsOf(sha) {
  const r = git(['diff-tree', '--no-commit-id', '--no-renames', '--name-status', '-z', '-r', sha], REPO);
  if (!r.ok) return null;
  const parsed = parseNameStatusZ(r.stdout);
  return parsed.ok ? parsed.paths : null;
}

// Assert the diff-and-classify decision for a real (parent -> sha) transition. Uses
// evaluateDiff (trusted SHAs) because these historical commits are not checked out; the
// entrypoint's separate checkout cross-check (computeDecision) is exercised by its own test.
function assertDecision(sha, parent, expected) {
  for (const key of KNOWN_WEB_APPS) {
    const d = evaluateDiff({ projectKey: key, prevSha: parent, headSha: sha, root: REPO });
    assert.equal(d.build, expected[key], `${key} for ${sha.slice(0, 8)}: expected build=${expected[key]}, got ${d.build} (${d.reason})`);
  }
}

// ---------------- (a) Pinned anchors ----------------

test('pinned: c03ba01 (docs-only on main) skips all three web apps', (t) => {
  if (!MAIN) return t.skip('no main ref');
  const sha = revParse('c03ba0170714d4d2f5634c141d9c254a855dcb17', REPO);
  if (!sha || !objectExists(sha, REPO)) return t.skip('anchor not in history');
  const parent = firstParentOf(sha);
  if (!parent) return t.skip('anchor is a merge or parent missing');
  console.log(`  [real] docs-only anchor ${sha.slice(0, 8)} paths=${(pathsOf(sha) || []).join(',')}`);
  assertDecision(sha, parent, { 'customer-web': false, 'merchant-web': false, 'admin-web': false });
});

test('pinned: 992eefe (feat(customer-web) on main) builds customer-web only', (t) => {
  if (!MAIN) return t.skip('no main ref');
  const sha = revParse('992eefe4a45864d18d209c9feeb3c9f4d13c6f40', REPO);
  if (!sha || !objectExists(sha, REPO)) return t.skip('anchor not in history');
  const parent = firstParentOf(sha);
  if (!parent) return t.skip('anchor is a merge or parent missing');
  const paths = pathsOf(sha) || [];
  // Only assert the clean "customer-web only" expectation if this commit really is scoped
  // to customer-web (guard against the anchor having drifted).
  const onlyCustomer = paths.length > 0 && paths.every((p) => classifyPath(p, 'customer-web') === 'SAFE' ? true : p.startsWith('apps/customer-web/'))
    && paths.some((p) => p.startsWith('apps/customer-web/'))
    && !paths.some((p) => classifyPath(p, 'merchant-web') === 'BUILD');
  if (!onlyCustomer) return t.skip(`anchor shape drifted: ${paths.join(',')}`);
  console.log(`  [real] customer-web anchor ${sha.slice(0, 8)}`);
  assertDecision(sha, parent, { 'customer-web': true, 'merchant-web': false, 'admin-web': false });
});

// ---------------- (b) Discovered fixtures ----------------

function categorize(paths) {
  if (!paths || paths.length === 0) return null;
  const under = (pre) => paths.every((p) => p.startsWith(pre));
  const rootMdOrDocs = paths.every((p) => p.startsWith('docs/') || /^[^/]+\.md$/.test(p) || p.startsWith('context/'));
  if (rootMdOrDocs) return { cat: 'docs-only', expect: allFalse() };
  if (under('src/')) return { cat: 'backend-only', expect: allFalse() };
  if (under('prisma/')) return { cat: 'prisma-only', expect: allFalse() };
  if (under('apps/customer-app/')) return { cat: 'customer-app-only', expect: allFalse() };
  if (paths.some((p) => p === 'package-lock.json')) return { cat: 'lockfile', expect: allTrue() };
  // single web app: all app-touching paths under exactly one apps/<web>/, nothing GLOBAL/unknown.
  const webAppsTouched = new Set();
  let cleanSingle = true;
  for (const p of paths) {
    if (p.startsWith('apps/')) {
      const app = p.slice(5).split('/')[0];
      if (KNOWN_WEB_APPS.includes(app)) webAppsTouched.add(app);
      else if (!KNOWN_APPS.includes(app)) cleanSingle = false; // unknown app dir
    } else {
      // any non-app path must be SAFE for all, else it's not a clean single-app commit
      if (KNOWN_WEB_APPS.some((k) => classifyPath(p, k) === 'BUILD')) cleanSingle = false;
    }
  }
  if (cleanSingle && webAppsTouched.size === 1) {
    const key = [...webAppsTouched][0];
    const expect = allFalse(); expect[key] = true;
    return { cat: `single:${key}`, expect };
  }
  return null;
}
const allFalse = () => ({ 'customer-web': false, 'merchant-web': false, 'admin-web': false });
const allTrue = () => ({ 'customer-web': true, 'merchant-web': true, 'admin-web': true });

test('discovered: real single-parent main commits decide correctly per category', (t) => {
  if (!MAIN) return t.skip('no main ref');
  const list = git(['rev-list', '--first-parent', '-n', '500', MAIN], REPO);
  if (!list.ok) return t.skip('rev-list failed');
  const shas = list.stdout.split('\n').map((s) => s.trim()).filter(Boolean);

  const wanted = new Set(['docs-only', 'backend-only', 'prisma-only', 'customer-app-only', 'lockfile', 'single:customer-web', 'single:merchant-web', 'single:admin-web']);
  const found = new Map();

  for (const sha of shas) {
    if (found.size >= wanted.size) break;
    const parent = firstParentOf(sha);
    if (!parent) continue;
    const paths = pathsOf(sha);
    const c = categorize(paths);
    if (!c || !wanted.has(c.cat) || found.has(c.cat)) continue;
    found.set(c.cat, { sha, parent, paths, expect: c.expect });
  }

  if (found.size === 0) {
    // Shallow checkout (e.g. actions/checkout depth 1): no real fixtures discoverable.
    // The git-constructed suites already prove the behaviour; skip rather than fail.
    return t.skip('no real fixtures discoverable (shallow history?)');
  }
  let asserted = 0;
  for (const [cat, fx] of found) {
    console.log(`  [real] ${cat}: ${fx.sha.slice(0, 8)} (${fx.paths.length} paths)`);
    assertDecision(fx.sha, fx.parent, fx.expect);
    asserted++;
  }
  // Report which categories had no real example in the window (informational, not a failure).
  for (const w of wanted) if (!found.has(w)) console.log(`  [real] (no fixture found in 500 commits for: ${w})`);
  console.log(`  [real] asserted ${asserted} real-history categories`);
});
