import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalShell } from '@/components/shared/LegalShell'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Redeemo collects, uses, and protects your personal data. UK-based, GDPR-compliant.',
}

const SIBLINGS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms',   label: 'Terms of Service' },
  { href: '/cookies', label: 'Cookie Policy' },
]

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Privacy Policy"
      updated="15 April 2026"
      siblings={SIBLINGS}
    >
      <h2>Who we are</h2>
      <p>
        Redeemo Ltd (&ldquo;Redeemo&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is a company registered in England and Wales. We operate the Redeemo website at redeemo.co.uk and the Redeemo mobile application. We act as the data controller for personal data collected through these services.
      </p>
      <p>
        If you have any questions about this policy or how we handle your data, contact us at{' '}
        <a href="mailto:info@redeemo.co.uk">info@redeemo.co.uk</a>.
      </p>

      <h2>What data we collect</h2>

      <h3>Account and profile data</h3>
      <p>When you create an account, we collect:</p>
      <ul>
        <li>First name and last name</li>
        <li>Email address</li>
        <li>Password (stored as a one-way hash — we cannot read it)</li>
        <li>Date of birth (used for age verification and personalisation)</li>
        <li>Gender (optional)</li>
        <li>Postcode and address (used to surface nearby merchants)</li>
        <li>Interests (categories you select to improve recommendations)</li>
        <li>Profile photo (if you upload one)</li>
        <li>Marketing communication preferences</li>
      </ul>

      <h3>Subscription and billing data</h3>
      <p>
        When you subscribe, we use Stripe to process your payment. Stripe handles and stores your card details directly — Redeemo never sees or stores your full card number, CVC, or expiry date. We store your Stripe customer ID to manage your subscription and a reference to your payment method.
      </p>
      <p>We record your subscription plan, billing dates, and payment history.</p>

      <h3>Redemption and activity data</h3>
      <p>
        Every time you redeem a voucher, we create a record that includes the merchant, branch, voucher, date and time, the redemption code generated, and whether it was validated by a member of staff. This data is used to enforce the one-redemption-per-cycle rule, provide your savings history, and give merchants anonymised reporting on offer performance.
      </p>

      <h3>Device and session data</h3>
      <p>
        When you log in, we record a device identifier, device type (web, iOS, Android), and an approximate device name derived from your browser or operating system. We use this to manage active sessions and allow you to log out of individual devices.
      </p>

      <h3>Location data</h3>
      <p>
        If you allow it in your browser or device settings, we use your approximate location to surface nearby merchants. We do not store your precise location continuously. Location access can be revoked at any time in your device or browser settings.
      </p>

      <h2>How we use your data</h2>
      <ul>
        <li><strong>Service delivery.</strong> To provide your account, show you relevant merchants and vouchers, process redemptions, and enforce membership rules.</li>
        <li><strong>Subscription management.</strong> To bill you, handle renewals and cancellations, and notify you of payment events via email.</li>
        <li><strong>Security.</strong> To verify your identity when you log in, detect fraud or abuse, and protect Redeemo and its users.</li>
        <li><strong>Customer support.</strong> To respond to your enquiries and resolve disputes with merchants.</li>
        <li><strong>Communications.</strong> Transactional emails (booking confirmations, receipts, password resets, OTP codes) and, if you opt in, marketing emails about new merchants and promotions. You can unsubscribe from marketing emails at any time.</li>
        <li><strong>Product improvement.</strong> Aggregated and anonymised analytics to understand how the platform is used and where it can be improved.</li>
      </ul>

      <h2>Legal basis for processing (GDPR)</h2>
      <ul>
        <li><strong>Contract.</strong> Processing your account data, billing, and redemptions is necessary to provide the service you have subscribed to.</li>
        <li><strong>Legitimate interest.</strong> Fraud prevention, security, and basic analytics.</li>
        <li><strong>Consent.</strong> Marketing emails. You can withdraw consent at any time by using the unsubscribe link in any marketing email or by updating your account preferences.</li>
        <li><strong>Legal obligation.</strong> Retaining financial records as required by UK law.</li>
      </ul>

      <h2>Who we share data with</h2>
      <p>We do not sell your personal data. We share data only with the following categories of service providers under appropriate data processing agreements:</p>
      <ul>
        <li><strong>Stripe.</strong> Payment processing and subscription management. Stripe is certified PCI DSS Level 1.</li>
        <li><strong>Twilio.</strong> SMS delivery for one-time passcodes used during login and sensitive account actions.</li>
        <li><strong>Resend.</strong> Transactional and marketing email delivery.</li>
        <li><strong>Neon / Vercel / Railway.</strong> Cloud infrastructure for hosting and database services.</li>
        <li><strong>Merchants.</strong> Merchants on Redeemo see only anonymised redemption counts and offer performance data. They do not receive your name, email, or any personally identifying information.</li>
      </ul>
      <p>
        We may disclose personal data if required by law, court order, or to protect the legal rights of Redeemo or its users.
      </p>

      <h2>How long we keep your data</h2>
      <ul>
        <li><strong>Account data.</strong> Retained while your account is active. If you delete your account, your personal data is deleted within 30 days, except where we are required to retain financial records by law.</li>
        <li><strong>Redemption history.</strong> Retained for 7 years to support financial record-keeping and dispute resolution.</li>
        <li><strong>Session and device records.</strong> Deleted after 90 days of inactivity.</li>
      </ul>

      <h2>Your rights</h2>
      <p>Under UK GDPR, you have the right to:</p>
      <ul>
        <li><strong>Access</strong> the personal data we hold about you</li>
        <li><strong>Correct</strong> inaccurate data (you can update most data directly in your account profile)</li>
        <li><strong>Erase</strong> your data (you can delete your account from your account settings)</li>
        <li><strong>Restrict</strong> or <strong>object</strong> to certain processing</li>
        <li><strong>Port</strong> your data to another service in a machine-readable format</li>
        <li><strong>Withdraw consent</strong> at any time where processing is based on consent</li>
      </ul>
      <p>
        To exercise any of these rights, contact us at{' '}
        <a href="mailto:info@redeemo.co.uk">info@redeemo.co.uk</a>. We will respond within 30 days. If you are unhappy with how we handle your request, you have the right to lodge a complaint with the Information Commissioner&apos;s Office (ICO) at{' '}
        <a href="https://ico.org.uk" target="_blank" rel="noreferrer">ico.org.uk</a>.
      </p>

      <h2>Cookies</h2>
      <p>
        We use a small number of cookies to keep you logged in and to understand how the site is used. See our{' '}
        <Link href="/cookies">Cookie Policy</Link> for full details.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. If we make significant changes, we will notify you by email or via a notice in the app. The date at the top of this page always shows when it was last updated.
      </p>

      <h2>Contact</h2>
      <p>
        Redeemo Ltd<br />
        Registered in England and Wales<br />
        Email: <a href="mailto:info@redeemo.co.uk">info@redeemo.co.uk</a>
      </p>
    </LegalShell>
  )
}
