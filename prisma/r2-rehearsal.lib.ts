/** Pure helpers for prisma/r2-rehearsal.ts (unit-testable without any R2 access). */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The ONLY namespace the rehearsal helper may touch: document/rehearsal-r2-<uuid>/ */
export function rehearsalPrefix(uuid: string): string {
  if (!UUID_RE.test(uuid)) {
    throw new Error(`rehearsal uuid must be a lowercase UUID (got ${JSON.stringify(uuid)})`)
  }
  return `document/rehearsal-r2-${uuid}/`
}

/** Fail-closed guard: every key the helper lists/puts must sit inside the rehearsal prefix. */
export function assertInsideRehearsalPrefix(key: string, uuid: string): void {
  const prefix = rehearsalPrefix(uuid)
  if (!key.startsWith(prefix) || key.includes('..') || key.slice(prefix.length).includes('/')) {
    throw new Error(`key ${JSON.stringify(key)} is outside the rehearsal prefix ${JSON.stringify(prefix)}`)
  }
}
