// Strip merchant prefix from a Branch.name to obtain the short label.
//
// Today's Branch.name includes the merchant prefix (e.g. "Covelum —
// Brightlingsea"). The headline branch line + voucher-context label want
// just the short part ("Brightlingsea"). A schema migration to
// `Branch.shortName` is tracked in the deferred-followups index §A; until
// it ships, this helper does the strip client-side.
//
// Recognised separators (in order): em dash (—), en dash (–), hyphen
// with surrounding whitespace ( - ). Returns the input unchanged when no
// separator is found.
export function branchShortName(name: string): string {
  if (!name) return ''
  const match = name.match(/^.*?\s*[—–]\s*(.*)$/) ?? name.match(/^.*?\s+-\s+(.*)$/)
  if (match && match[1]) return match[1].trim()
  return name.trim()
}
