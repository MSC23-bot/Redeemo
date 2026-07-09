// Perf batch 1 (2026-07-09) — MOVED to `design-system/motion/useScrollActivity`.
// `scrollActivity` is a platform-wide motion primitive (Merchant Profile and
// Voucher Detail now drive it too, alongside Home), so the hook that owns it
// belongs in `design-system/motion`, not under a single feature. This path
// re-exports the moved implementation so anything still importing from here
// (e.g. `tests/features/home/hooks/useScrollActivity.test.tsx`) keeps working.
export { useScrollActivity } from '@/design-system/motion/useScrollActivity'
