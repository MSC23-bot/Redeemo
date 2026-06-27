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
