// Core build-decision logic, separated from the process boundary so it is unit-testable.
//
// Returns a decision object; NEVER throws. The process wrapper (vercel-should-build.mjs)
// maps { build: true } -> exit 1 (BUILD) and { build: false } -> exit 0 (SKIP), per Vercel's
// Ignored Build Step contract.
//
// Order of fail-open guards (every one that trips returns build:true):
//   1. invalid/unknown project key
//   2. missing/invalid VERCEL_GIT_PREVIOUS_SHA (no baseline: first deploy of project/branch)
//   3. HEAD unresolvable
//   4. PREV === HEAD (same-SHA redeploy, e.g. after an env-var change)
//   5. PREV not present in the (shallow) clone (out of depth / force-push / GC)
//   6. git diff failed
//   7. diff output failed the defensive parser
//   8. empty tree diff (PREV != HEAD but identical trees, e.g. --allow-empty commit)
//   9. any changed path classifies BUILD for this project
// Only if none trip and every changed path is SAFE do we return build:false.
import { objectExists, revParse, diffNameStatusZ, repoRoot, SHA_RE } from './git.mjs';
import { parseNameStatusZ } from './parse.mjs';
import { decide, KNOWN_WEB_APPS } from './policy.mjs';

/**
 * @param {{projectKey?: string, prevSha?: string, headSha?: string, cwd?: string}} opts
 * @returns {{build: boolean, reason: string, detail: object}}
 */
export function computeDecision({ projectKey, prevSha, headSha, cwd = process.cwd() } = {}) {
  try {
    if (typeof projectKey !== 'string' || !KNOWN_WEB_APPS.includes(projectKey)) {
      return { build: true, reason: 'invalid-or-missing-project-key', detail: { projectKey: projectKey ?? null } };
    }

    // Pin all git operations to the repo root. The Vercel Root Directory is apps/<app>, so
    // process.cwd() is a subdirectory; running git from the root (combined with --no-relative
    // in the diff wrappers) guarantees full repo-relative paths and repo-wide change coverage,
    // immune to a diff.relative git config. If we cannot resolve the root, BUILD.
    const root = repoRoot(cwd);
    if (!root) {
      return { build: true, reason: 'cannot-resolve-repo-root', detail: { cwd } };
    }

    if (typeof prevSha !== 'string' || !SHA_RE.test(prevSha)) {
      return { build: true, reason: 'no-or-invalid-previous-sha', detail: { prevSha: prevSha ?? null } };
    }

    const head = typeof headSha === 'string' && SHA_RE.test(headSha) ? headSha : revParse('HEAD', root);
    if (!head) {
      return { build: true, reason: 'cannot-resolve-head', detail: {} };
    }

    if (prevSha === head) {
      return { build: true, reason: 'same-sha-redeploy', detail: { sha: head } };
    }

    if (!objectExists(prevSha, root)) {
      return { build: true, reason: 'previous-sha-out-of-history', detail: { prevSha } };
    }

    const diff = diffNameStatusZ(prevSha, head, root);
    if (!diff.ok) {
      return { build: true, reason: 'git-diff-failed', detail: { stderr: (diff.stderr || '').slice(0, 200) } };
    }

    const parsed = parseNameStatusZ(diff.raw);
    if (!parsed.ok) {
      return { build: true, reason: `diff-parse-anomaly:${parsed.reason}`, detail: {} };
    }

    // decide() forces BUILD on an empty path list (empty-diff) and on any BUILD-classified path.
    const d = decide(projectKey, parsed.paths);
    return {
      build: d.build,
      reason: d.reason,
      detail: { changedCount: parsed.paths.length, triggers: d.triggers || [] },
    };
  } catch (e) {
    // Absolute backstop: any unexpected throw => BUILD.
    return { build: true, reason: 'exception', detail: { message: String((e && e.message) || e).slice(0, 200) } };
  }
}
