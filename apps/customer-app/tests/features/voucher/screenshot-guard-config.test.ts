import { SCREENSHOT_GUARD_ENABLED } from '@/features/voucher/hooks/screenshotGuardConfig'

// Shared kill-switch for the screenshot anti-fraud guard (locked
// 2026-05-09 from deferred-followups §AG5). Single source of truth
// for whether `useScreenshotGuard` + `useScreenCaptureProtection`
// engage on surfaces that display the redemption code.
//
// These pins guard against:
//   1. Accidental dev-only flip to `false` shipping to prod.
//   2. Accidental relocation/rename that breaks the import contract
//      consumed by ShowToStaff.tsx and VoucherDetailScreen.tsx.

describe('SCREENSHOT_GUARD_ENABLED — shared config', () => {
  it('exports the kill-switch as a boolean true (default — guard engaged)', () => {
    // **Pin against accidental `false` flip.** The constant is the
    // app-wide remediation toggle; dev experiments that flip it to
    // false should NEVER be merged. CI catches the flip via this
    // pin. To intentionally disable the guard for a release, this
    // test must be updated alongside the constant — making the
    // change conscious.
    expect(SCREENSHOT_GUARD_ENABLED).toBe(true)
  })

  it('is a boolean, not a function or other shape (consumer call sites use it in `&& active` AND-gates)', () => {
    // ShowToStaff and VoucherDetailScreen both compose this with
    // their local `active` boolean (`SCREENSHOT_GUARD_ENABLED &&
    // active`). A non-boolean value would silently coerce in JS
    // but TypeScript catches at compile-time. This test pins the
    // runtime shape too as defence-in-depth.
    expect(typeof SCREENSHOT_GUARD_ENABLED).toBe('boolean')
  })
})
