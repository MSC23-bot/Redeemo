// Proxy-trust configuration (Security Stabilisation Gate — SEC-H2).
//
// Fastify's `trustProxy` controls whether `X-Forwarded-For` is honoured when
// computing `req.ip`. Getting this right is REQUIRED for IP-based rate limiting:
// behind a hosting proxy (Railway / Render) the socket peer is the proxy, so
// without `trustProxy` every request shares ONE rate-limit bucket (the proxy IP)
// — collapsing per-client limits and making brute-force / abuse throttles
// ineffective (and self-DoS-prone). But trusting `X-Forwarded-For` when there is
// NO proxy lets a client spoof their IP to evade limits — so we must NOT blindly
// enable it.
//
// Config-driven via TRUST_PROXY (default: OFF — safe for local dev):
//   - unset / 'false' / '0'      → false  (local: req.ip = socket peer; XFF ignored)
//   - a positive integer 'n'     → n      (RECOMMENDED for hosted: trust the last
//                                          n proxy hops; single-proxy PaaS = 1)
//   - 'true'                     → true   (trust ALL hops — discouraged; only if the
//                                          platform guarantees XFF is rewritten at
//                                          the edge so it cannot be client-spoofed)
//   - a comma-separated IP/CIDR  → string (trust only these proxy addresses)
//
// Prefer the hop-count (e.g. TRUST_PROXY=1 on Railway). Verify the exact hop count
// against the deployed platform: hit a route, confirm req.ip is your real client IP.
export function resolveTrustProxy(): boolean | number | string {
  const raw = (process.env.TRUST_PROXY ?? '').trim()
  if (raw === '' || raw.toLowerCase() === 'false' || raw === '0') return false
  if (raw.toLowerCase() === 'true') return true
  if (/^\d+$/.test(raw)) return parseInt(raw, 10)
  // Otherwise treat as a comma-separated IP/subnet allowlist (proxy-addr syntax).
  return raw
}
