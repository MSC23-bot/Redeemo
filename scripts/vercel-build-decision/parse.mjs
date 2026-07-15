// Byte-safe parser for `git diff --no-renames --no-relative --name-status -z <A> <B>` output.
//
// WHY --no-renames --name-status -z:
//   - `--name-only` is UNSAFE: git reports a rename apps/admin-web/a.ts -> docs/a.ts as
//     just "docs/a.ts", hiding that an admin-web source file was removed. Reproduced on
//     git 2.50.1. That silently reclassifies a real deletion as docs-only.
//   - `--no-renames` decomposes every rename into a delete (D old) + add (A new), so BOTH
//     paths are classified. Copies (C) never appear under --no-renames.
//   - `--name-status` gives the status letter so deletions/typechanges are visible.
//   - `-z` emits NUL-delimited RAW paths, so filenames containing spaces, tabs, or newlines
//     are parsed correctly (non -z output is C-quoted and would mangle them).
//
// WHY BYTES (not a UTF-8 string): git `-z` emits raw path bytes, which may not be valid
// UTF-8. Decoding the whole stream with `encoding: 'utf8'` replaces invalid bytes with U+FFFD,
// silently corrupting a path (and potentially reclassifying it). This parser works on a Buffer,
// splits on the NUL byte, and STRICTLY decodes each path token as UTF-8: any invalid encoding
// is rejected (ok:false) so the caller BUILDs. A plain string is still accepted (encoded to a
// Buffer first) for convenience in fixtures.
//
// Record shape (per change): STATUS \0 PATH \0
//   STATUS is exactly one of A (add), M (modify), D (delete), T (typechange).
//   We DEFENSIVELY REJECT anything else (R*, C*, U, B, X, multi-char, empty). A rejection
//   returns { ok: false }, which every caller treats as BUILD (fail-open).

const ALLOWED_STATUS = new Set(['A', 'M', 'D', 'T']);
const NUL = 0x00;
// fatal:true => decode() throws on any byte sequence that is not valid UTF-8.
const strictDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * @param {Buffer|string} raw stdout bytes from the diff command (Buffer preferred)
 * @returns {{ok: true, records: {status: string, path: string}[], paths: string[]}
 *          | {ok: false, reason: string}}
 */
export function parseNameStatusZ(raw) {
  let buf;
  if (Buffer.isBuffer(raw)) buf = raw;
  else if (typeof raw === 'string') buf = Buffer.from(raw, 'utf8');
  else return { ok: false, reason: 'non-buffer-input' };

  if (buf.length === 0) return { ok: true, records: [], paths: [] }; // no changes

  // Split on NUL bytes into token sub-buffers (no decoding yet).
  const tokens = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === NUL) {
      tokens.push(buf.subarray(start, i));
      start = i + 1;
    }
  }
  if (start < buf.length) tokens.push(buf.subarray(start)); // trailing bytes with no final NUL

  // Drop trailing EMPTY tokens (a well-formed stream ends with a NUL -> one trailing empty).
  while (tokens.length > 0 && tokens[tokens.length - 1].length === 0) tokens.pop();
  if (tokens.length === 0) return { ok: true, records: [], paths: [] };

  const records = [];
  let i = 0;
  while (i < tokens.length) {
    const statusBuf = tokens[i];
    // Status is ASCII; decode via latin1 is exact for one byte, but keep it simple: it must be
    // a single allowed letter. Reject anything else (also catches a rename/copy record whose
    // extra path token would land in a STATUS slot -> misalignment -> BUILD).
    const status = statusBuf.length === 1 ? String.fromCharCode(statusBuf[0]) : bufToDisplay(statusBuf);
    if (!ALLOWED_STATUS.has(status)) {
      return { ok: false, reason: `unexpected-status:${truncate(status)}` };
    }
    const pathBuf = tokens[i + 1];
    if (pathBuf === undefined) return { ok: false, reason: 'missing-path-token' };
    if (pathBuf.length === 0) return { ok: false, reason: 'empty-path-token' };
    // STRICT UTF-8 decode of the path; invalid bytes => fail-open BUILD.
    let path;
    try {
      path = strictDecoder.decode(pathBuf);
    } catch {
      return { ok: false, reason: 'invalid-path-encoding' };
    }
    records.push({ status, path });
    i += 2;
  }

  // Consistency: we must have consumed the tokens in exact (status, path) pairs.
  if (records.length * 2 !== tokens.length) {
    return { ok: false, reason: 'odd-token-count' };
  }

  return { ok: true, records, paths: records.map((r) => r.path) };
}

function bufToDisplay(b) {
  // Lossy display of an unexpected status token, only for the rejection reason string.
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(b);
  } catch {
    return `<${b.length} bytes>`;
  }
}

function truncate(v) {
  const s = typeof v === 'string' ? v : String(v);
  return s.length > 16 ? `${s.slice(0, 16)}...` : s;
}
