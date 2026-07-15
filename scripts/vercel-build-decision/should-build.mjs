// Core build-decision logic, separated from the process boundary so it is unit-testable.
//
// Returns a decision object; NEVER throws. The process wrapper (vercel-should-build.mjs)
// maps { build: true } -> exit 1 (BUILD) and { build: false } -> exit 0 (SKIP), per Vercel's
// Ignored Build Step contract.
//
// Order of fail-open guards (every one that trips returns build:true):
//   1. invalid/unknown project key
//   2. repo root unresolvable
//   3. actual checked-out HEAD unresolvable
//   4. supplied HEAD (VERCEL_GIT_COMMIT_SHA) != actual checked-out HEAD (provider/checkout skew)
//   5. missing/invalid VERCEL_GIT_PREVIOUS_SHA (no baseline: first deploy of project/branch)
//   6. PREV === HEAD (same-SHA redeploy, e.g. after an env-var change)
//   7. PREV not present in the (shallow) clone (out of depth / force-push / GC)
//   8. git diff failed
//   9. diff output failed the byte-safe defensive parser
//  10. empty tree diff (PREV != HEAD but identical trees, e.g. --allow-empty commit)
//  11. any changed path classifies BUILD for this project
// Only if none trip and every changed path is SAFE do we return build:false.
import { objectExists, revParse, diffNameStatusZ, repoRoot, SHA_RE } from './git.mjs';
import { parseNameStatusZ } from './parse.mjs';
import { decide, KNOWN_WEB_APPS } from './policy.mjs';

/**
 * Full decision as used by the Vercel Ignored Build Step. Resolves the repo root and the
 * ACTUAL checked-out HEAD, and fails open if the provider-supplied HEAD disagrees with what is
 * really checked out (the build deploys the checkout, not the env var). Then delegates to
 * evaluateDiff, which diffs the ACTUAL head against the baseline.
 *
 * @param {{projectKey?: string, prevSha?: string, headSha?: string, cwd?: string}} opts
 *        headSha = VERCEL_GIT_COMMIT_SHA (provider-claimed head; cross-checked, not trusted).
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

    // The commit that will actually be built is whatever is checked out. Resolve it and diff
    // against IT, never against an unverified env value.
    const actualHead = revParse('HEAD', root);
    if (!actualHead) {
      return { build: true, reason: 'cannot-resolve-head', detail: {} };
    }

    // The provider MUST supply a valid, resolvable commit SHA (VERCEL_GIT_COMMIT_SHA) that
    // matches the checkout. Anything else is a provider/checkout anomaly => BUILD:
    //   - missing or malformed (not a 40-hex sha) => missing-or-invalid-commit-sha
    //   - a valid sha that is not the checked-out HEAD (incl. an absent object, which cannot
    //     equal the resolvable actualHead) => head-sha-mismatch
    // The diff always runs against the ACTUAL checkout, never an unverified env value.
    if (typeof headSha !== 'string' || !SHA_RE.test(headSha)) {
      return { build: true, reason: 'missing-or-invalid-commit-sha', detail: { suppliedHead: headSha ?? null } };
    }
    if (headSha !== actualHead) {
      return { build: true, reason: 'head-sha-mismatch', detail: { suppliedHead: headSha, actualHead } };
    }

    return evaluateDiff({ projectKey, prevSha, headSha: actualHead, root });
  } catch (e) {
    // Absolute backstop: any unexpected throw => BUILD.
    return { build: true, reason: 'exception', detail: { message: String((e && e.message) || e).slice(0, 200) } };
  }
}

/**
 * Diff `headSha` against `prevSha` and decide. `headSha` is TRUSTED here (computeDecision has
 * already reconciled it with the checkout). Exposed for unit tests that diff explicit historical
 * commit pairs without checking them out.
 * @param {{projectKey: string, prevSha?: string, headSha: string, root: string}} opts
 * @returns {{build: boolean, reason: string, detail: object}}
 */
export function evaluateDiff({ projectKey, prevSha, headSha, root } = {}) {
  try {
    if (typeof projectKey !== 'string' || !KNOWN_WEB_APPS.includes(projectKey)) {
      return { build: true, reason: 'invalid-or-missing-project-key', detail: { projectKey: projectKey ?? null } };
    }
    if (typeof headSha !== 'string' || !SHA_RE.test(headSha)) {
      return { build: true, reason: 'invalid-head-sha', detail: { headSha: headSha ?? null } };
    }
    if (typeof prevSha !== 'string' || !SHA_RE.test(prevSha)) {
      return { build: true, reason: 'no-or-invalid-previous-sha', detail: { prevSha: prevSha ?? null } };
    }
    if (prevSha === headSha) {
      return { build: true, reason: 'same-sha-redeploy', detail: { sha: headSha } };
    }
    if (!objectExists(prevSha, root)) {
      return { build: true, reason: 'previous-sha-out-of-history', detail: { prevSha } };
    }

    const diff = diffNameStatusZ(prevSha, headSha, root);
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
    return { build: true, reason: 'exception', detail: { message: String((e && e.message) || e).slice(0, 200) } };
  }
}
