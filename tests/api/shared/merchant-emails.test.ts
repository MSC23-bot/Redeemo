import { describe, it, expect } from 'vitest'
import { merchantChangesRequestedEmail, merchantRejectedEmail, merchantLiveEmail } from '../../../src/api/shared/merchantEmails'

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

  describe('merchantLiveEmail (M5)', () => {
    it('renders a "you\'re live" subject + the business name in the body', () => {
      const r = merchantLiveEmail('Coastal Kitchen')
      expect(r.subject).toMatch(/live/i)
      expect(r.text).toContain('Coastal Kitchen')
      expect(r.html).toContain('Coastal Kitchen')
    })

    it('HTML-escapes the business name defensively (markup in the name cannot break the body)', () => {
      const r = merchantLiveEmail('Bistro <script>alert(1)</script>')
      // text body carries the raw name; html body escapes it.
      expect(r.text).toContain('Bistro <script>alert(1)</script>')
      expect(r.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
      expect(r.html).not.toContain('<script>alert(1)</script>')
    })

    it('carries no em dash (merchant-facing brand rule)', () => {
      const r = merchantLiveEmail('The Old Foundry')
      expect(r.subject).not.toContain('—')
      expect(r.text).not.toContain('—')
      expect(r.html).not.toContain('—')
    })
  })
})
