/**
 * Client-side release flags for the admin web.
 *
 * These gate whether a completed-but-not-yet-activatable feature's UI renders and issues
 * requests. They exist because the admin web auto-deploys from `main`, so source reaching `main`
 * makes the UI live immediately, potentially BEFORE the compatible backend routes / DB columns are
 * deployed. A default-off flag lets such source merge DORMANT: hidden and inert until deliberately
 * enabled after backend + migration compatibility is established and verified.
 *
 * FAIL CLOSED. Every reader uses strict equality to the literal string 'true'. Any other value,
 * including unset (undefined), 'false', 'TRUE', '1', 'yes', '' or whitespace, resolves to OFF. An
 * ambiguous or invalid value is therefore OFF, never ON: an activation must set EXACTLY 'true'.
 *
 * `NEXT_PUBLIC_*` vars are inlined at BUILD time by Next.js, so a build with the var unset ships an
 * OFF feature. Defining or changing the var in the hosting provider (e.g. Vercel) and rebuilding is
 * a SEPARATE, owner-approved provider action; it is never performed by feature code.
 */

/**
 * D65 lane-2 admin signing-evidence read (view detail + server-proxied signed-PDF download).
 * OFF by default. Activation (setting NEXT_PUBLIC_EVIDENCE_UI_ENABLED='true' + rebuild) is blocked
 * until the D65 migration set is applied and the compatible backend is deployed (see the migration
 * window packet, PR #532). When OFF the evidence panel/button do not render (even for SUPER_ADMIN)
 * and no evidence/PDF request is ever issued.
 */
export function isEvidenceUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EVIDENCE_UI_ENABLED === 'true'
}
