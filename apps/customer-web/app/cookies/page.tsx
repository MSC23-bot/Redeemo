import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalShell } from '@/components/shared/LegalShell'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'How Redeemo uses cookies and similar technologies on its website.',
}

const SIBLINGS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms',   label: 'Terms of Service' },
  { href: '/cookies', label: 'Cookie Policy' },
]

export default function CookiesPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Cookie Policy"
      updated="15 April 2026"
      siblings={SIBLINGS}
    >
      <h2>What are cookies?</h2>
      <p>
        Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work, improve performance, and provide information to the site owner. Some cookies are essential for the site to function; others are optional.
      </p>

      <h2>How Redeemo uses cookies</h2>
      <p>
        We use a limited set of cookies, described below. We do not use third-party advertising or tracking cookies. We do not share cookie data with advertising networks.
      </p>

      <h3>Essential cookies</h3>
      <p>
        These cookies are required for the website to function and cannot be turned off. They include:
      </p>
      <ul>
        <li>
          <strong>Session authentication.</strong> A cookie that tells the site whether you are logged in, so you do not need to re-enter your password on every page. This is set when you log in and cleared when you log out.
        </li>
        <li>
          <strong>CSRF protection.</strong> A cookie used to prevent cross-site request forgery attacks. This is a standard security mechanism and contains no personal information.
        </li>
      </ul>
      <p>
        Essential cookies do not require your consent under UK law. They are set automatically when you use the service.
      </p>

      <h3>Preference cookies</h3>
      <p>
        These cookies remember choices you make on the site, such as your preferred location or display settings. They improve your experience but are not required for the service to function.
      </p>

      <h3>Analytics cookies</h3>
      <p>
        We may use privacy-friendly analytics tools to understand how visitors use the site — which pages are visited most, where users come from, and where they encounter difficulties. Any analytics data we collect is aggregated and does not identify you individually. We do not currently use Google Analytics.
      </p>

      <h2>Third-party cookies</h2>

      <h3>Stripe</h3>
      <p>
        When you visit the subscription or payment pages, Stripe (our payment processor) may set cookies on your device to detect fraud, remember your payment method, and provide a secure checkout experience. Stripe is PCI DSS Level 1 certified. Their cookie and privacy practices are governed by the{' '}
        <a href="https://stripe.com/gb/privacy" target="_blank" rel="noreferrer">Stripe Privacy Policy</a>.
      </p>

      <h3>No advertising cookies</h3>
      <p>
        Redeemo does not use Facebook Pixel, Google Ads tags, or any other advertising tracking cookies. We do not build behavioural profiles for advertising purposes.
      </p>

      <h2>How long do cookies last?</h2>
      <ul>
        <li><strong>Session cookies</strong> — deleted automatically when you close your browser.</li>
        <li><strong>Persistent cookies</strong> — remain on your device for a set period (typically 30–90 days) or until you clear them. Your authentication cookie is persistent so that you stay logged in across sessions.</li>
      </ul>

      <h2>How to manage cookies</h2>
      <p>
        You can control and delete cookies through your browser settings. Most browsers allow you to:
      </p>
      <ul>
        <li>See what cookies are set and delete individual ones</li>
        <li>Block third-party cookies</li>
        <li>Block all cookies (note: this will prevent you from staying logged in to Redeemo)</li>
        <li>Set preferences per website</li>
      </ul>
      <p>
        Instructions for managing cookies in the most common browsers:
      </p>
      <ul>
        <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noreferrer">Google Chrome</a></li>
        <li><a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noreferrer">Mozilla Firefox</a></li>
        <li><a href="https://support.apple.com/en-gb/guide/safari/sfri11471/mac" target="_blank" rel="noreferrer">Apple Safari</a></li>
        <li><a href="https://support.microsoft.com/en-us/windows/delete-and-manage-cookies-168dab11-0753-043d-7c16-ede5947fc64d" target="_blank" rel="noreferrer">Microsoft Edge</a></li>
      </ul>

      <h2>The Redeemo mobile app</h2>
      <p>
        The Redeemo mobile app does not use browser cookies. It uses secure local storage and device identifiers for session management. See our{' '}
        <Link href="/privacy">Privacy Policy</Link> for details on how we handle device data in the app.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this Cookie Policy to reflect changes in the cookies we use or applicable regulations. The date at the top of this page shows when it was last updated.
      </p>

      <h2>Contact</h2>
      <p>
        If you have questions about our use of cookies, contact us at{' '}
        <a href="mailto:info@redeemo.co.uk">info@redeemo.co.uk</a>.
      </p>
    </LegalShell>
  )
}
