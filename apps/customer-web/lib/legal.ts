/**
 * Single source of truth for the customer-web legal pages' VERSION and EFFECTIVE
 * DATE. The static legal pages (`app/terms`, `app/privacy`, `app/cookies`) render
 * `LEGAL_EFFECTIVE_DATE` via `LegalShell`, instead of each hardcoding the date.
 *
 * `LEGAL_VERSION` is kept in lock-step with the backend consent version
 * (`src/api/shared/legal.ts` → `TERMS_VERSION`) by a static guard test, so the
 * version a user consents to at signup always maps to these published documents.
 *
 * NOTE: the effective date + the final legal content are owner/legal-owned. Do
 * not treat editing this file as legal sign-off (see deploy-security-runbook §12).
 */
export const LEGAL_VERSION = '1.0'
export const LEGAL_EFFECTIVE_DATE = '15 April 2026'
