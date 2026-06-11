import { describe, it, expect } from 'vitest'
import { merchantChangesRequestedEmail, merchantRejectedEmail } from '../../../src/api/shared/merchantEmails'

describe('M3 — merchant lifecycle email templates', () => {
  describe('merchantChangesRequestedEmail', () => {
    it('renders a subject + the admin reason, HTML-escaping the reason in the html body', () => {
      const r = merchantChangesRequestedEmail('Add a <script>alert(1)</script> clearer logo & address')
      expect(r.subject).toMatch(/changes requested/i)
      // text body carries the raw reason; html body escapes it.
      expect(r.text).toContain('Add a <script>alert(1)</script> clearer logo & address')
      expect(r.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
      expect(r.html).toContain('&amp;')
      expect(r.html).not.toContain('<script>alert(1)</script>')
    })
  })

  describe('merchantRejectedEmail', () => {
    it('renders a subject + the admin reason, HTML-escaping the reason', () => {
      const r = merchantRejectedEmail('Does not meet our <b>quality</b> bar')
      expect(r.subject).toMatch(/update on your/i)
      expect(r.text).toContain('Does not meet our <b>quality</b> bar')
      expect(r.html).toContain('&lt;b&gt;quality&lt;/b&gt;')
      expect(r.html).not.toContain('<b>quality</b>')
    })
  })
})
