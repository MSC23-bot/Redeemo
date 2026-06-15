import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildPasswordResetLink,
  passwordResetEmail,
  branchPinEmail,
  adminOtpEmail,
  adminMerchantSubmittedEmail,
  adminMerchantResubmittedEmail,
} from '../../../src/api/shared/emailTemplates'

// Phase 0 PR-0.4: the two transactional templates the placeholders need.

const URL_VARS = ['WEB_APP_URL', 'MERCHANT_PORTAL_URL', 'ADMIN_PANEL_URL'] as const
let saved: Record<string, string | undefined>
beforeEach(() => {
  saved = {}
  for (const k of URL_VARS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of URL_VARS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('buildPasswordResetLink', () => {
  it('uses the role-appropriate base + /reset-password?token=', () => {
    expect(buildPasswordResetLink('customer', 'abc')).toBe('http://localhost:3001/reset-password?token=abc')
    expect(buildPasswordResetLink('merchant', 'abc')).toBe('https://merchant.redeemo.co.uk/reset-password?token=abc')
    expect(buildPasswordResetLink('admin', 'abc')).toBe('https://admin.redeemo.co.uk/reset-password?token=abc')
  })

  it('honours env overrides and strips a trailing slash', () => {
    process.env.WEB_APP_URL = 'https://redeemo.co.uk/'
    expect(buildPasswordResetLink('customer', 'xyz')).toBe('https://redeemo.co.uk/reset-password?token=xyz')
  })

  it('URL-encodes the token', () => {
    expect(buildPasswordResetLink('customer', 'a b/c')).toContain('token=a%20b%2Fc')
  })
})

describe('passwordResetEmail', () => {
  it('renders the link in both html + text and states the 1-hour expiry', () => {
    const link = 'http://localhost:3001/reset-password?token=tok'
    const email = passwordResetEmail(link)
    expect(email.subject).toMatch(/reset your redeemo password/i)
    expect(email.html).toContain(`href="${link}"`)
    expect(email.text).toContain(link)
    expect(email.html).toMatch(/expires in 1 hour/i)
  })
})

describe('branchPinEmail', () => {
  it('includes the PIN and HTML-escapes a merchant-controlled branch name (no injection)', () => {
    const email = branchPinEmail('Joe\'s <script>Café', '1234')
    expect(email.text).toContain('1234')
    expect(email.html).toContain('1234')
    // the raw <script> tag must NOT appear unescaped in the HTML
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('strips control chars (CR/LF) from the SUBJECT — header-injection defence', () => {
    const CR = String.fromCharCode(13)
    const LF = String.fromCharCode(10)
    const email = branchPinEmail(`Soho${CR}${LF}Bcc: evil@example.com`, '1234')
    // no CR/LF survives in the subject header
    const hasControl = [...email.subject].some((c) => {
      const code = c.charCodeAt(0)
      return code === 10 || code === 13
    })
    expect(hasControl).toBe(false)
    expect(email.subject).toContain('redemption PIN')
    expect(email.subject).toContain('Soho Bcc: evil@example.com') // flattened to one line
  })
})

describe('adminOtpEmail', () => {
  it('renders the 6-digit code in both html + text and states the 10-minute expiry', () => {
    const email = adminOtpEmail('492018')
    expect(email.subject).toMatch(/sign.?in|log.?in/i)
    expect(email.subject).toMatch(/code/i)
    expect(email.text).toContain('492018')
    expect(email.html).toContain('492018')
    expect(email.text).toMatch(/10 minutes/i)
    expect(email.html).toMatch(/10 minutes/i)
  })

  it('contains no URL or link (the code is the whole payload — never a clickable link)', () => {
    const email = adminOtpEmail('492018')
    expect(email.html).not.toContain('http')
    expect(email.html).not.toContain('href')
    expect(email.text).not.toContain('http')
  })
})

describe('adminMerchantSubmittedEmail (M8) — injection defence', () => {
  it('HTML-escapes a merchant-controlled business name (no raw <script>)', () => {
    const email = adminMerchantSubmittedEmail('Joe\'s <script>alert(1)</script> Diner')
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('strips control chars (CR/LF) from the SUBJECT — header-injection defence', () => {
    const CR = String.fromCharCode(13)
    const LF = String.fromCharCode(10)
    const email = adminMerchantSubmittedEmail(`Soho${CR}${LF}Bcc: evil@example.com`)
    const hasControl = [...email.subject].some((c) => {
      const code = c.charCodeAt(0)
      return code === 10 || code === 13
    })
    expect(hasControl).toBe(false)
  })
})

describe('adminMerchantResubmittedEmail (M8) — injection defence', () => {
  it('HTML-escapes a merchant-controlled business name (no raw <script>)', () => {
    const email = adminMerchantResubmittedEmail('<script>x</script> Bakery')
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('strips control chars (CR/LF) from the SUBJECT — header-injection defence', () => {
    const CR = String.fromCharCode(13)
    const LF = String.fromCharCode(10)
    const email = adminMerchantResubmittedEmail(`A${CR}${LF}Bcc: evil@example.com`)
    const hasControl = [...email.subject].some((c) => {
      const code = c.charCodeAt(0)
      return code === 10 || code === 13
    })
    expect(hasControl).toBe(false)
  })
})
