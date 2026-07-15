// Parser for `git diff --no-renames --name-status -z <A> <B>` output.
//
// WHY --no-renames --name-status -z:
//   - `--name-only` is UNSAFE: git reports a rename apps/admin-web/a.ts -> docs/a.ts as
//     just "docs/a.ts", hiding that an admin-web source file was removed. Reproduced on
//     git 2.50.1. That silently reclassifies a real deletion as docs-only.
//   - `--no-renames` decomposes every rename into a delete (D old) + add (A new), so BOTH
//     paths are classified. Copies (C) never appear under --no-renames.
//   - `--name-status` gives the status letter so deletions/typechanges are visible.
//   - `-z` emits NUL-delimited raw paths, so filenames containing spaces, tabs, or
//     newlines are parsed correctly (non -z output is C-quoted and would mangle them).
//
// Record shape (per change): STATUS \0 PATH \0
//   STATUS is exactly one of A (add), M (modify), D (delete), T (typechange).
//   We DEFENSIVELY REJECT anything else (R*, C*, U, B, X, multi-char, empty). A rejection
//   returns { ok: false }, which every caller treats as BUILD (fail-open).

const ALLOWED_STATUS = new Set(['A', 'M', 'D', 'T']);

/**
 * @param {string} raw stdout from the diff command
 * @returns {{ok: true, records: {status: string, path: string}[], paths: string[]}
 *          | {ok: false, reason: string}}
 */
export function parseNameStatusZ(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'non-string-input' };
  if (raw.length === 0) return { ok: true, records: [], paths: [] }; // no changes

  const tokens = raw.split('\0');
  // A well-formed stream ends with a trailing NUL, producing a final empty token.
  // Drop only trailing empty tokens; an empty token anywhere else is an anomaly.
  while (tokens.length > 0 && tokens[tokens.length - 1] === '') tokens.pop();
  if (tokens.length === 0) return { ok: true, records: [], paths: [] };

  const records = [];
  let i = 0;
  while (i < tokens.length) {
    const status = tokens[i];
    // The token in the STATUS position must be a single allowed letter.
    // Rejecting here also catches misalignment: if git ever emitted a rename/copy
    // record (STATUS \0 OLD \0 NEW \0) despite --no-renames, the extra path token would
    // land in a STATUS slot and fail this check => BUILD.
    if (!ALLOWED_STATUS.has(status)) {
      return { ok: false, reason: `unexpected-status:${truncate(status)}` };
    }
    const path = tokens[i + 1];
    if (path === undefined) return { ok: false, reason: 'missing-path-token' };
    if (path === '') return { ok: false, reason: 'empty-path-token' };
    records.push({ status, path });
    i += 2;
  }

  // Consistency: we must have consumed the tokens in exact (status, path) pairs.
  if (records.length * 2 !== tokens.length) {
    return { ok: false, reason: 'odd-token-count' };
  }

  return { ok: true, records, paths: records.map((r) => r.path) };
}

function truncate(v) {
  const s = typeof v === 'string' ? v : String(v);
  return s.length > 16 ? `${s.slice(0, 16)}...` : s;
}
