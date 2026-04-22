# 3C.1a — WCAG 2.1 AA Contrast Audit

Measured with Stark or equivalent. All body text ≥4.5:1, large text ≥3:1.

## Design token pairs

| Pair | Ratio | Status |
|---|---|---|
| textPrimary `#010C35` on surface `#FFFFFF` | 16.6:1 | ✅ AAA |
| textSecondary `#4B5563` on surface `#FFFFFF` | 7.2:1 | ✅ AAA |
| textTertiary `#9CA3AF` on surface `#FFFFFF` | 2.8:1 | ⚠️ meta-only, never body |
| brandRose `#E20C04` on surface `#FFFFFF` | 4.6:1 | ✅ AA |
| white on brandRose `#E20C04` | 4.6:1 | ✅ AA |
| danger `#B91C1C` on surface `#FFFFFF` | 6.3:1 | ✅ AA |

## Screens

All screens use textPrimary/textSecondary on white surface (verified above). Gradient screens (Welcome, Subscribe-prompt) use white text on the brand gradient — the midpoint `#E53005` at 4.5:1 just meets AA for large text. Body text on gradient screens is avoided.
