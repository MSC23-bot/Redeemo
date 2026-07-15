// Read-only production tripwire core.
//
// Purpose: prove that every main commit RELEVANT to a web project (i.e. that changed the
// project's own source or the GLOBAL install seam, per policy.mjs) is actually contained in
// the project's live production deployment. It catches the failure mode we most fear: the
// build-decision script wrongly skipping a real production change.
//
// This module is PURE GIT. It performs NO network calls and reads NO credentials. The caller
// supplies the deployed production SHA (obtained out of band; see the runbook). SHAs are
// compared by exact equality or `git merge-base --is-ancestor` -- never lexically/numerically.
import { git, objectExists, isAncestor, revParse, repoRoot, commitChangedRaw, SHA_RE } from './git.mjs';
import { parseNameStatusZ } from './parse.mjs';
import { KNOWN_WEB_APPS, commitIsRelevant } from './policy.mjs';

/**
 * True iff commit C is accounted for by deployed production SHA D (C === D or C is an
 * ancestor of D). This is the relationship that makes squash merges and later batched
 * production deployments (D covering several main commits) pass correctly.
 */
export function isAccountedFor(commitSha, productionSha, cwd) {
  return isAncestor(commitSha, productionSha, cwd);
}

/**
 * Enumerate the RELEVANT main commits for the given web keys in (baseline, mainRef].
 * @returns {{ok: true, commits: {sha: string, keys: string[]}[]}
 *          | {ok: false, reason: string}}
 */
export function relevantCommits({ baseline, mainRef = 'main', keys = KNOWN_WEB_APPS, cwd } = {}) {
  if (baseline !== undefined && baseline !== null && !SHA_RE.test(baseline)) {
    return { ok: false, reason: 'invalid-baseline-sha' };
  }
  // Pin to the repo root so a diff.relative config cannot narrow the per-commit diffs.
  const root = repoRoot(cwd) || cwd;
  const range = baseline ? `${baseline}..${mainRef}` : mainRef;
  const listed = git(['rev-list', '--first-parent', range], root);
  if (!listed.ok) return { ok: false, reason: `rev-list-failed:${(listed.stderr || '').slice(0, 120)}` };

  const shas = listed.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const commits = [];
  for (const sha of shas) {
    const dt = commitChangedRaw(sha, root); // byte-safe diff vs first parent (empty tree if root)
    if (!dt.ok) return { ok: false, reason: `commit-diff-failed:${sha}` };
    const parsed = parseNameStatusZ(dt.raw);
    if (!parsed.ok) return { ok: false, reason: `parse-anomaly:${sha}:${parsed.reason}` };
    const relKeys = keys.filter((k) => commitIsRelevant(k, parsed.paths));
    if (relKeys.length) commits.push({ sha, keys: relKeys });
  }
  return { ok: true, commits };
}

/**
 * Run the tripwire for one web project.
 * @param {{projectKey: string, productionSha: string, baseline?: string, mainRef?: string, cwd?: string}} opts
 * @returns {{ok: boolean, alert: boolean, alerts: object[], checked?: number, reason?: string}}
 *
 * `ok:false`/`alert:true` conditions (any one requires rolling that project back to
 * Automatic + re-enabling native skip, then investigating): missing/invalid production SHA,
 * production SHA absent from the repo, production SHA not on main, git enumeration failure,
 * or any relevant commit not accounted for by the production SHA.
 */
export function runTripwire({ projectKey, productionSha, baseline, mainRef = 'main', cwd } = {}) {
  if (!KNOWN_WEB_APPS.includes(projectKey)) {
    return { ok: false, alert: true, alerts: [{ type: 'invalid-project-key', projectKey: projectKey ?? null }] };
  }
  if (!SHA_RE.test(productionSha || '')) {
    return { ok: false, alert: true, alerts: [{ type: 'missing-or-invalid-production-sha', productionSha: productionSha ?? null }] };
  }
  if (!objectExists(productionSha, cwd)) {
    return { ok: false, alert: true, alerts: [{ type: 'production-sha-not-in-repo', productionSha }] };
  }

  // Resolve the main ref to a concrete SHA so the ancestry check compares SHA-to-SHA.
  const mainSha = revParse(mainRef, cwd);
  if (!mainSha) {
    return { ok: false, alert: true, alerts: [{ type: 'cannot-resolve-main-ref', mainRef }] };
  }

  const alerts = [];
  if (!isAncestor(productionSha, mainSha, cwd)) {
    // A production deployment whose SHA is not on main is unexpected (manual promote of an
    // off-main build); surface it rather than silently trusting it.
    alerts.push({ type: 'production-sha-not-on-main', productionSha });
  }

  const rel = relevantCommits({ baseline, mainRef, keys: [projectKey], cwd });
  if (!rel.ok) {
    return { ok: false, alert: true, alerts: [{ type: 'enumeration-failed', reason: rel.reason }] };
  }

  const missed = rel.commits.map((c) => c.sha).filter((sha) => !isAccountedFor(sha, productionSha, cwd));
  if (missed.length) {
    alerts.push({ type: 'unaccounted-relevant-commits', commits: missed });
  }

  return { ok: alerts.length === 0, alert: alerts.length > 0, alerts, checked: rel.commits.length, productionSha };
}
