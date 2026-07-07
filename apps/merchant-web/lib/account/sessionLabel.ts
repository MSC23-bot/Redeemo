// My Account "Where you are signed in" (§BP-ACC): pure helpers for turning the
// backend's raw session row (deviceType/deviceName/userAgent) into an honest,
// friendly label. No geo-IP lookup exists anywhere in this codebase (the backend
// row carries `ipAddress`, not a city), so this module NEVER derives or displays a
// location - callers show device + relative last-active only. This intentionally
// diverges from the visual prototype (which shows a fabricated "Bristol, United
// Kingdom" line) - inventing a location from an IP address without a real geo-IP
// service would be a plain fabrication, not a staged-honest placeholder.

/**
 * Derive a short "device · app-or-browser" label from a session row.
 *
 * Today every real session in this system carries `deviceType: 'web'` (the
 * merchant portal is the only client that exists - the Merchant Mobile App is a
 * planned, not-yet-built surface per PROJECT-STATE). For a web session the label
 * is derived entirely from the User-Agent string: a hardware/OS token (Mac,
 * Windows PC, iPhone, iPad, Android, Linux) paired with a browser name (Chrome,
 * Safari, Firefox, Edge). `isCurrent` prefixes the hardware token with "This "
 * (e.g. "This Mac"), matching the prototype's current-row treatment.
 *
 * The `deviceType !== 'web'` branch is forward-looking: if a future native client
 * (e.g. a staff validation app) ever reports a non-'web' deviceType + a
 * deviceName, that name leads the label (e.g. "Staff app") paired with whatever
 * hardware token the UA yields. This is unreachable with today's real data (no
 * such session can exist yet) but is a genuine derivation, not fabricated
 * content, so it costs nothing to have ready.
 */
export function formatSessionDeviceLabel(session: {
  deviceType: string
  deviceName: string | null
  userAgent: string
}, isCurrent: boolean): string {
  const hardware = hardwareToken(session.userAgent)

  if (session.deviceType !== 'web' && session.deviceName) {
    return hardware ? `${session.deviceName} · ${hardware}` : session.deviceName
  }

  const browser = browserToken(session.userAgent)
  const device = isCurrent ? `This ${hardware ?? 'device'}` : hardware ?? (session.deviceName || 'Unknown device')
  return browser ? `${device} · ${browser}` : device
}

function hardwareToken(ua: string): string | null {
  if (/iPad/.test(ua)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return 'Android device'
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  if (/Linux/.test(ua)) return 'Linux PC'
  return null
}

function browserToken(ua: string): string | null {
  if (/Edg\//.test(ua)) return 'Edge'
  if (/CriOS\//.test(ua)) return 'Chrome'
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome'
  if (/FxiOS\//.test(ua) || /Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari'
  return null
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "Active now" for the caller's own current session; otherwise a full-word
 * relative time ("5 minutes ago" / "2 hours ago" / "3 days ago") for every other
 * live session, falling back to a short date beyond a week. Deliberately full
 * words (not the bell's abbreviated "2h ago") to match the My Account prototype's
 * copy register; kept as its own helper rather than reusing
 * lib/notifications/relativeTime.ts so that formatter's abbreviated convention for
 * the notification bell is untouched.
 */
export function formatSessionLastActive(iso: string, isCurrent: boolean, now: Date = new Date()): string {
  if (isCurrent) return 'Active now'

  const then = new Date(iso)
  const ms = now.getTime() - then.getTime()
  if (Number.isNaN(then.getTime())) return ''
  if (ms < 0) return 'Active now'

  if (ms < MINUTE) return 'Just now'
  if (ms < HOUR) {
    const mins = Math.max(1, Math.floor(ms / MINUTE))
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`
  }
  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR)
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }
  const days = Math.floor(ms / DAY)
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`

  const sameYear = then.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(then)
}

/**
 * A longer-range "Last changed ..." style relative age, for things that move on
 * the order of weeks/months/years rather than minutes/hours (e.g.
 * MerchantAccount.passwordChangedAt). Buckets: < 1d "today", < 7d "N days ago",
 * < 30d "N weeks ago", < 365d "N months ago", else "N years ago".
 */
export function formatApproxAge(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const ms = Math.max(0, now.getTime() - then.getTime())

  if (ms < DAY) return 'today'
  const days = Math.floor(ms / DAY)
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `${months} ${months === 1 ? 'month' : 'months'} ago`
  }
  const years = Math.floor(days / 365)
  return `${years} ${years === 1 ? 'year' : 'years'} ago`
}
