// §DG spec 2026-05-23-popular-ranking-design.md §6.2 — QA-account email
// filter for Popular ranking + Trending inclusion query.  Belt-and-braces
// against direct Prisma redemption creates that skip the isTestData flag.
//
// Lookups are case-insensitive on both the exact-email list and the
// domain suffix list.  Empty / null email → not a QA account.

export const QA_ACCOUNT_EMAILS: readonly string[] = [
  'customer@redeemo.com',
] as const

export const QA_ACCOUNT_EMAIL_DOMAINS: readonly string[] = [
  'redeemo.dev',
] as const

export function isQaAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const lower = email.toLowerCase()
  if (QA_ACCOUNT_EMAILS.includes(lower)) return true
  return QA_ACCOUNT_EMAIL_DOMAINS.some((d) => lower.endsWith(`@${d.toLowerCase()}`))
}
