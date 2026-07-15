// Thin, read-only git wrappers used by the build-decision script, the tripwire, and tests.
// Every function is total: it NEVER throws and reports failure as a value, so callers can
// treat any git problem as BUILD (fail-open).
import { spawnSync } from 'node:child_process';

const SHA_RE = /^[0-9a-f]{40}$/;

/**
 * Run git with the given args in cwd.
 * @returns {{ok: boolean, stdout: string, stderr: string, code: number|null}}
 */
export function git(args, cwd) {
  try {
    const res = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (res.error) {
      return { ok: false, stdout: '', stderr: String(res.error.message || res.error), code: null };
    }
    return {
      ok: res.status === 0,
      stdout: res.stdout || '',
      stderr: res.stderr || '',
      code: res.status,
    };
  } catch (e) {
    return { ok: false, stdout: '', stderr: String((e && e.message) || e), code: null };
  }
}

/** Resolve a ref to a 40-char commit SHA, or null on any failure. */
export function revParse(ref, cwd) {
  const r = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
  const out = r.ok ? r.stdout.trim() : '';
  return SHA_RE.test(out) ? out : null;
}

/** True iff the given SHA exists as a commit object in this (possibly shallow) clone. */
export function objectExists(sha, cwd) {
  if (!SHA_RE.test(sha)) return false;
  return git(['cat-file', '-e', `${sha}^{commit}`], cwd).ok;
}

/** Absolute repo-root (working-tree) path for cwd, or null if cwd is not in a git work tree. */
export function repoRoot(cwd) {
  const r = git(['rev-parse', '--show-toplevel'], cwd);
  const out = r.ok ? r.stdout.trim() : '';
  return out.length ? out : null;
}

// SAFETY: `--no-relative` forces full repo-relative paths and includes changes across the
// WHOLE repo, regardless of the cwd or a `diff.relative=true` git config. Without it, running
// from the project Root Directory (apps/<app>) with diff.relative on would strip the
// `apps/<app>/` prefix (making own-app files look like safe root paths) AND omit changes
// outside the subdirectory (root package.json, sibling apps) -> a wrong SKIP. Callers also
// pin cwd to the repo root as defense in depth.

/**
 * Content-tree diff between two commits, `--no-renames --no-relative --name-status -z`.
 * @returns {{ok: boolean, raw: string, stderr: string}}
 */
export function diffNameStatusZ(prev, head, cwd) {
  const r = git(['diff', '--no-renames', '--no-relative', '--name-status', '-z', prev, head], cwd);
  return { ok: r.ok, raw: r.stdout, stderr: r.stderr };
}

/**
 * Changed paths of a single commit vs its first parent, `--no-renames --no-relative --name-status -z`.
 * Used by the tripwire. For a root commit git emits an empty diff.
 * @returns {{ok: boolean, raw: string, stderr: string}}
 */
export function commitChangedRaw(sha, cwd) {
  const r = git(
    ['diff-tree', '--no-commit-id', '--no-renames', '--no-relative', '--name-status', '-z', '-r', '--first-parent', sha],
    cwd,
  );
  return { ok: r.ok, raw: r.stdout, stderr: r.stderr };
}

/** True iff `ancestor` is an ancestor of `descendant` (or equal). */
export function isAncestor(ancestor, descendant, cwd) {
  if (!SHA_RE.test(ancestor) || !SHA_RE.test(descendant)) return false;
  if (ancestor === descendant) return true;
  const r = git(['merge-base', '--is-ancestor', ancestor, descendant], cwd);
  return r.ok && r.code === 0;
}

export { SHA_RE };
