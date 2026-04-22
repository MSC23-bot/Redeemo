export function formatCode(code: string): string {
  const raw = code.replace(/\s+/g, '')
  if (raw.length === 6) {
    return `${raw.slice(0, 3)} ${raw.slice(3)}`
  }
  if (raw.length === 10) {
    return `${raw.slice(0, 5)} ${raw.slice(5)}`
  }
  return raw
}

export function codeAccessibilityLabel(code: string): string {
  const raw = code.replace(/\s+/g, '')
  const spoken = raw.split('').join(', ')
  return `Redemption code. ${spoken}.`
}
