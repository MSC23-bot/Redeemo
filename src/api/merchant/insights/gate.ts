// Insights PR-A Task A6: behavioural runtime gate (spec 13.5, plan 2.5).
//
// Because code merged to main auto-deploys, hiding the PR-B UI is not enough:
// the registered backend behavioural endpoints (repeat-customer-rate, new-vs-
// returning, the customer-history queries) plus the event-level Redemption
// activity CSV / printable event-level rows could still query real customer
// history. This gate is the non-bypassable, server-side, default-off signal that
// MUST be checked before any real-data behavioural query or the event-level
// export executes. Operational aggregates (redemption-activity count, distinct-
// customers within-period, savings, voucher/branch rankings, by-type share,
// busy-times, validation totals) are NOT gated by this and run regardless.
//
// LOCKED invariants (spec 13.5):
//   - SERVER-OWNED ONLY: this function takes no caller-supplied input. Nothing in
//     a request, header, body, query string, or cookie can flip it. The signature
//     accepts no opener argument; the only input is the server-owned config below.
//   - DEFAULT OFF: with no config set, the gate is closed (returns false).
//   - PRODUCTION FAIL-CLOSED: in production an unset / empty / non-affirmative
//     value is closed. Only an explicit affirmative recorded value opens it.
//
// IMPORTANT: the affirmative value that opens this gate MUST be the recorded
// PR-0a D5 gate-open artefact (the owner-approved, bounded-review output), never
// a bare deploy default. Setting INSIGHTS_BEHAVIOURAL_GATE='1' in a deploy
// environment without that recorded D5 approval is an operational mistake, not a
// permitted shortcut: this code only reads the value, it does not authorise it.

/**
 * The single server-owned config the gate reads. It is intentionally an
 * environment variable (server process config) so no request-scoped value can
 * influence it.
 */
const GATE_ENV_VAR = 'INSIGHTS_BEHAVIOURAL_GATE'

/**
 * The only values that open the gate. Limiting to an explicit allow-list (rather
 * than any truthy string) keeps production fail-closed: a typo, a junk value, or
 * a stray default does NOT open behavioural processing.
 */
const AFFIRMATIVE_VALUES = new Set(['1', 'true'])

/**
 * behaviouralGateOpen: true only when the server-owned config records an explicit
 * affirmative open value. Default off; production fails closed. Takes no
 * arguments by design - it is a server-owned signal, never caller-influenced.
 */
export function behaviouralGateOpen(): boolean {
  const value = process.env[GATE_ENV_VAR]
  if (typeof value !== 'string') return false
  return AFFIRMATIVE_VALUES.has(value)
}

// --- Undecided PR-0a D6 threshold config (server-owned, fail-closed) ---------
//
// The busy-times "Busiest" badge near-empty-peak threshold AND the repeat-rate
// minimum reliable cohort size are UNDECIDED PR-0a D6 governance values (spec
// §1.3 / §1.7; plan §3 D6). They MUST NOT ship as hard-coded defaults that
// silently decide policy. Like behaviouralGateOpen, each is read from a single
// SERVER-OWNED env var by a no-arg helper (nothing in a request/header/body/
// query/cookie can influence it), and is FAIL-CLOSED by default:
//
//   - busy-times peak (INSIGHTS_BUSY_PEAK_MIN_COUNT): UNSET / non-positive-integer
//     => NO approved threshold => null => the caller NEVER names a peak (busiest
//     is always null, the pre-D6 safe fallback). Set to a positive integer N (the
//     recorded D6 value) => surface busiest only when peakCount >= N.
//   - repeat-rate min cohort (INSIGHTS_REPEAT_RATE_MIN_COHORT): UNSET / non-positive
//     => NO approved minimum => null => the caller treats repeat-rate as ALWAYS
//     insufficient (value null, insufficient true), never a one-person 0%/100%.
//     Set to a positive integer K (the recorded D6 value) => compute only when the
//     cohort >= K.
//
// IMPORTANT: the value set here MUST be the recorded PR-0a D6 output (owner-
// approved, bounded-review). This code only reads the value, it does not authorise
// it - a bare deploy default would be an operational mistake, not a permitted
// shortcut. Until D6 records a value, the safe fallbacks above hold.

const BUSY_PEAK_MIN_COUNT_ENV_VAR = 'INSIGHTS_BUSY_PEAK_MIN_COUNT'
const REPEAT_RATE_MIN_COHORT_ENV_VAR = 'INSIGHTS_REPEAT_RATE_MIN_COHORT'

/**
 * Parse a server-owned env var as a POSITIVE INTEGER threshold, fail-closed: any
 * unset / empty / non-integer / non-positive value => null (no approved
 * threshold). Only an exact positive-integer decimal string (e.g. '5') returns a
 * number. Whitespace, floats ('5.5'), negatives, zero, and junk all fail closed.
 */
function readPositiveIntThreshold(envVar: string): number | null {
  const raw = process.env[envVar]
  if (typeof raw !== 'string') return null
  // Exact positive-integer decimal string only (no whitespace, sign, decimal,
  // exponent, or leading zeros beyond a bare value). This keeps the gate strict:
  // a typo or junk value fails closed rather than opening a near-individual figure.
  if (!/^[1-9][0-9]*$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * The busy-times near-empty-peak minimum count (UNDECIDED PR-0a D6). null when no
 * approved threshold is recorded => the caller NEVER names a peak (busiest stays
 * null, the pre-D6 safe fallback). A positive integer N => busiest is surfaced
 * only when the peak cell count is >= N. Server-owned; no caller can influence it.
 */
export function busyPeakMinCount(): number | null {
  return readPositiveIntThreshold(BUSY_PEAK_MIN_COUNT_ENV_VAR)
}

/**
 * The repeat-rate minimum reliable cohort size (UNDECIDED PR-0a D6). null when no
 * approved minimum is recorded => the caller treats repeat-rate as ALWAYS
 * insufficient (never a one-person 0%/100%). A positive integer K => the rate is
 * computed only when the distinct in-period cohort is >= K (same fail-closed
 * treatment for the comparison window). Server-owned; no caller can influence it.
 */
export function repeatRateMinCohort(): number | null {
  return readPositiveIntThreshold(REPEAT_RATE_MIN_COHORT_ENV_VAR)
}
