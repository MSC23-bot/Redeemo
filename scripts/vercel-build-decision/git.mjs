// Thin, read-only git wrappers used by the build-decision script, the tripwire, and tests.
// Every function is total: it NEVER throws and reports failure as a value, so callers can
// treat any git problem as BUILD (fail-open).
import { spawnSync } from 'node:child_process';

const SHA_RE = /^[0-9a-f]{40}$/;
// git's canonical empty-tree object (always present); used as the diff base for root commits.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/**
 * Run git with the given args in cwd, decoding stdout as UTF-8. Use ONLY for output that is
 * guaranteed ASCII/UTF-8 (SHAs, ancestry checks, toplevel path). For raw path bytes from a
 * diff, use gitBytes + the byte-safe parser instead.
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

/**
 * Run git and return stdout as RAW BYTES (a Buffer), never lossily decoded. Required for
 * `-z` diff output: a filename may contain bytes that are not valid UTF-8, and decoding with
 * `encoding: 'utf8'` would replace them with U+FFFD, silently corrupting the path. The
 * byte-safe parser (parse.mjs) rejects any path whose bytes are not valid UTF-8 -> BUILD.
 * @returns {{ok: boolean, stdout: Buffer, stderr: string, code: number|null}}
 */
export function gitBytes(args, cwd) {
  try {
    const res = spawnSync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 }); // no encoding => Buffer stdout
    if (res.error) {
      return { ok: false, stdout: Buffer.alloc(0), stderr: String(res.error.message || res.error), code: null };
    }
    return {
      ok: res.status === 0,
      stdout: Buffer.isBuffer(res.stdout) ? res.stdout : Buffer.from(res.stdout || ''),
      stderr: (res.stderr ? res.stderr.toString('utf8') : ''),
      code: res.status,
    };
  } catch (e) {
    return { ok: false, stdout: Buffer.alloc(0), stderr: String((e && e.message) || e), code: null };
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
 * `raw` is a Buffer of RAW bytes for the byte-safe parser.
 * @returns {{ok: boolean, raw: Buffer, stderr: string}}
 */
export function diffNameStatusZ(prev, head, cwd) {
  const r = gitBytes(['diff', '--no-renames', '--no-relative', '--name-status', '-z', prev, head], cwd);
  return { ok: r.ok, raw: r.stdout, stderr: r.stderr };
}

/**
 * Changed paths a single commit introduced relative to its FIRST parent, byte-safe.
 * Uses an explicit `<sha>^1 <sha>` diff (NOT `diff-tree --first-parent <sha>`, which returns
 * an EMPTY stream for a genuine 2-parent merge and would hide an app change a merge brought
 * onto main). For a root commit (no parent) the base is the empty tree, so all files show.
 * @returns {{ok: boolean, raw: Buffer, stderr: string}}
 */
export function commitChangedRaw(sha, cwd) {
  const firstParent = revParse(`${sha}^1`, cwd); // null for a root commit
  const base = firstParent || EMPTY_TREE;
  const r = gitBytes(['diff', '--no-renames', '--no-relative', '--name-status', '-z', base, sha], cwd);
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
