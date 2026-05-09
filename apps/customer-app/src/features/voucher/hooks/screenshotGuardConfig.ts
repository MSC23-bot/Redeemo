/**
 * Shared kill-switch for the screenshot anti-fraud guard (locked
 * 2026-05-09 from deferred-followups §AG5 — post-PR-#49 cleanup).
 *
 * Single source of truth for whether `useScreenshotGuard` (iOS post-
 * fact screenshot listener) AND `useScreenCaptureProtection` (Android
 * FLAG_SECURE + iOS recording-blur) engage on surfaces that display
 * the redemption code.
 *
 * Consumed by:
 *   • `<ShowToStaff>` — full-screen QR surface.
 *   • `<VoucherDetailScreen>` — persisted RedemptionDetailsCard during
 *     the 2-hour presentation window.
 *
 * Default: `true` (guard engaged). Behaviour with `true` is unchanged
 * from the pre-§AG5 state — both call sites already defaulted to
 * engaged via local `const SCREENSHOT_GUARD_ENABLED = true` in
 * ShowToStaff and an unconditional hook call in VoucherDetailScreen.
 *
 * **Why a single shared constant.** Before §AG5, ShowToStaff carried
 * its own kill-switch but VoucherDetailScreen did not — flipping the
 * iOS listener off as a fast-remediation path required editing two
 * call sites (and risked missing one). Centralising the toggle here
 * makes "disable iOS screenshot detection app-wide" a one-line
 * change. Locked at deferred-followups §AG5; tested by an
 * import-shape pin so accidental dev-only `false` flips are caught.
 *
 * **Fast-remediation procedure (do not relitigate without owner approval).**
 * If on-device QA surfaces instability with `expo-screen-capture` on
 * a specific iOS version or device:
 *   1. Flip this constant to `false`.
 *   2. Ship the build.
 *   3. The iOS post-fact listener AND the cross-platform prevent/
 *      allow lifecycle ALL disengage. QR rendering, polling, validated
 *      transition, auto-hide, AppState wiring, brightness boost —
 *      none affected (each is independent of this guard).
 *
 * Cross-refs:
 *   • deferred-followups §AB locked iOS framing (never describe iOS
 *     screenshot path as "prevention").
 *   • deferred-followups §AE5 / §AE6 / §AE6.2 — the surfaces that
 *     consume this guard.
 *   • `BRIGHTNESS_BOOST_ENABLED` in ShowToStaff.tsx — same fail-safe
 *     spirit but ShowToStaff-only (no Voucher Detail brightness path
 *     today). Not centralised here since the use-site is single.
 */
export const SCREENSHOT_GUARD_ENABLED = true
