/**
 * Waiting-age time math for the approval queue.
 *
 * Pure functions (accept an optional `now` param) so they are trivial to
 * unit-test without mocking Date.now(). Tone/colour derivation for the age
 * pill lives in `lib/ui/adminTones.ts` (`ageToneForHours`) — this module is
 * time math only, single responsibility.
 *
 * B1 (Approval Queue two-court fidelity): the display format changed from
 * whole-unit prose ("2 days" / "under an hour") to the combined `{d}d {h}h`
 * form the design spec's screenshots use ("2d 14h", "22h", "<1h"), which
 * reads faster for triage at a glance. The old day-based `urgencyForAge`
 * (3-day/5-day boundaries) is retired in favour of the spec's hour-based
 * boundaries in `lib/ui/adminTones.ts` (`ageToneForHours`, >=12h/>=36h).
 */

/** Whole hours elapsed since `submittedAtIso`. */
export function hoursWaiting(submittedAtIso: string, now: number = Date.now()): number {
  return Math.floor((now - new Date(submittedAtIso).getTime()) / 3_600_000)
}

/**
 * Human-readable waiting duration from submission to now.
 *   >= 1 day  -> "{d}d {h}h" (remaining hours always shown, even if 0)
 *   >= 1 hour -> "{h}h"
 *   else      -> "<1h"
 */
export function formatWaiting(submittedAtIso: string, now: number = Date.now()): string {
  const hours = hoursWaiting(submittedAtIso, now)
  if (hours < 1) return '<1h'
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const remainder = hours % 24
  return `${days}d ${remainder}h`
}
