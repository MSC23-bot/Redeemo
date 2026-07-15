// Path-classification policy for the Vercel per-project build decision.
//
// SINGLE SOURCE OF TRUTH. Both the build-decision script (vercel-should-build.mjs)
// and the production tripwire (vercel-production-tripwire.mjs) import from this file
// so the two can never drift apart.
//
// SAFETY CONTRACT (non-negotiable):
//   - The default outcome is BUILD.
//   - A path is SAFE (ignorable) for a web project ONLY if it matches an explicit
//     allowlist below. Anything unrecognized => BUILD.
//   - SKIP for a project is permitted ONLY when the changed-path list is non-empty
//     AND every path in it classifies SAFE for that project.
//
// The classification was established by inspecting the Redeemo repo: the three web
// apps (apps/*-web) have zero build-time imports from src/, prisma/, or sibling apps;
// they share a single root package-lock.json and root React `overrides`, so the root
// install seam is a genuine cross-cutting dependency of all three.

// The three Vercel web projects this policy governs.
export const KNOWN_WEB_APPS = ['customer-web', 'merchant-web', 'admin-web'];

// Every app directory we recognize under apps/. Web apps + the Expo mobile app.
// A path under apps/<x>/ where x is NOT in this set is treated as UNKNOWN => BUILD
// (fail-open: a newly added, unclassified app might be shared code).
export const KNOWN_APPS = [...KNOWN_WEB_APPS, 'customer-app'];

// Root files that force a build of ALL web projects (install / runtime seam).
// Owner-locked set: root package.json, package-lock.json, .npmrc (if introduced), .nvmrc.
const GLOBAL_ROOT_FILES = new Set([
  'package.json',
  'package-lock.json',
  '.npmrc',
  '.nvmrc',
]);

// Exact root files that are SAFE to ignore for every web app.
const SAFE_EXACT = new Set([
  'prisma.config.ts',
  'vitest.config.ts',
  'tsconfig.json',
  'tsconfig.build.json',
  'Procfile',
  '.gitignore',
  '.env.example',
]);

// Root directory prefixes that are SAFE to ignore for every web app.
const SAFE_PREFIXES = [
  'src/', // backend (Fastify) source; zero web imports (verified)
  'prisma/', // schema, migrations, seed
  'tests/', // backend/integration tests
  'docs/', // documentation, plans, evidence
  'context/', // agent context
  '.claude/', // agent config, hooks, worktrees
  '.github/', // CI workflows
];

/**
 * Classify a single changed path from the perspective of one web project.
 * @param {string} path repo-relative path (forward slashes, as git emits)
 * @param {string} projectKey one of KNOWN_WEB_APPS
 * @returns {'BUILD'|'SAFE'} 'BUILD' means this path forces a build of projectKey.
 *
 * Never throws for a string input; any malformed input returns 'BUILD' (fail-open).
 */
export function classifyPath(path, projectKey) {
  // Fail-open on malformed inputs.
  if (typeof path !== 'string' || path.length === 0) return 'BUILD';
  if (typeof projectKey !== 'string' || !KNOWN_WEB_APPS.includes(projectKey)) return 'BUILD';

  // 1. GLOBAL install / runtime seam => build all web projects.
  if (GLOBAL_ROOT_FILES.has(path)) return 'BUILD';

  // 2. App-scoped paths under apps/.
  if (path.startsWith('apps/')) {
    const rest = path.slice('apps/'.length);
    const slash = rest.indexOf('/');
    // "apps/" alone, or "apps/loosefile" with no subdirectory => unknown => BUILD.
    if (slash <= 0) return 'BUILD';
    const app = rest.slice(0, slash);
    if (app === projectKey) return 'BUILD'; // this project's own source changed
    if (KNOWN_APPS.includes(app)) return 'SAFE'; // a known, independent sibling app
    return 'BUILD'; // unknown app directory => fail-open
  }

  // 3. Known-safe root files and directories.
  if (SAFE_EXACT.has(path)) return 'SAFE';
  for (const prefix of SAFE_PREFIXES) {
    if (path.startsWith(prefix)) return 'SAFE';
  }
  // Root-level markdown (e.g. CLAUDE.md, README.md) is documentation.
  if (/^[^/]+\.md$/.test(path)) return 'SAFE';

  // 4. Anything else: new top-level file/dir or unrecognized path => BUILD.
  return 'BUILD';
}

/**
 * Decide BUILD vs SKIP for a project given the FULL list of changed paths.
 * @param {string} projectKey one of KNOWN_WEB_APPS
 * @param {string[]} paths every changed path (both sides of renames already flattened)
 * @returns {{build: boolean, reason: string, triggers?: string[]}}
 *
 * Contract: an empty path list => BUILD (an empty tree diff must build; see the
 * script layer, which also forces BUILD before ever reaching here for that case).
 * SKIP is returned ONLY when every path classifies SAFE.
 */
export function decide(projectKey, paths) {
  if (!Array.isArray(paths)) return { build: true, reason: 'invalid-paths' };
  if (paths.length === 0) return { build: true, reason: 'empty-diff' };

  const triggers = [];
  for (const p of paths) {
    if (classifyPath(p, projectKey) === 'BUILD') {
      triggers.push(p);
      if (triggers.length >= 5) break; // cap for log readability
    }
  }
  if (triggers.length > 0) {
    return { build: true, reason: 'path-affects-project', triggers };
  }
  return { build: false, reason: 'all-paths-safe' };
}

/**
 * For the tripwire: is a commit relevant to a given web project?
 * Relevant iff it has at least one changed path AND at least one classifies BUILD.
 * @param {string} projectKey
 * @param {string[]} paths the commit's changed paths
 * @returns {boolean}
 */
export function commitIsRelevant(projectKey, paths) {
  if (!Array.isArray(paths) || paths.length === 0) return false;
  return paths.some((p) => classifyPath(p, projectKey) === 'BUILD');
}
