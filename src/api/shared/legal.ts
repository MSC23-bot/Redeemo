/**
 * Single source of truth for the legal-consent VERSION recorded at customer
 * signup (`User.tcConsentVersion`).
 *
 * This MUST stay in lock-step with the customer-web legal pages' version
 * (`apps/customer-web/lib/legal.ts` → `LEGAL_VERSION`). A static guard test
 * (`tests/api/legal/legal-content.guard.test.ts`) asserts they are equal, so the
 * version a user consents to at signup always maps to a known published version
 * of the Terms / Privacy pages — they cannot drift silently.
 *
 * NOTE: bumping this is a legal/content decision (a new published version of the
 * terms). Do not change it as a side effect of unrelated work. The final legal
 * content + effective date are owner/legal-owned — see deploy-security-runbook §12.
 */
export const TERMS_VERSION = '1.0'
