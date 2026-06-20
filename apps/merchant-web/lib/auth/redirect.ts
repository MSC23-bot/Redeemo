// M1 Slice 2: open-redirect guard for the ?next param. The middleware only ever
// WRITES a same-origin pathname into next, but the sign-in/otp screens READ it from
// the URL (attacker-controllable), so the consumer MUST validate it. Accept only a
// single-leading-slash same-origin relative path; reject protocol-relative (//host),
// any scheme (://), and backslash/control tricks. Falls back to '/'.
export function safeNext(next: string | null | undefined): string {
  if (!next) return '/'
  if (
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.includes('://') ||
    next.includes('\\') ||
    next.includes('\t') ||
    next.includes('\n') ||
    next.includes('\r')
  ) {
    return '/'
  }
  return next
}
