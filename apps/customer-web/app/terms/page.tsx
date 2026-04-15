import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalShell } from '@/components/shared/LegalShell'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of Redeemo — membership, vouchers, and your rights.',
}

const SIBLINGS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms',   label: 'Terms of Service' },
  { href: '/cookies', label: 'Cookie Policy' },
]

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Terms of Service"
      updated="15 April 2026"
      siblings={SIBLINGS}
    >
      <h2>Agreement to these terms</h2>
      <p>
        By creating a Redeemo account or using the Redeemo website or mobile application, you agree to these Terms of Service. If you do not agree, do not use the service. These terms are governed by the laws of England and Wales.
      </p>
      <p>
        These terms apply to all users of Redeemo, including free members, paid subscribers, and merchants. Separate terms apply to merchant accounts — see the Merchant Terms during merchant onboarding.
      </p>

      <h2>Your account</h2>
      <h3>Eligibility</h3>
      <p>
        You must be at least 18 years old to create a Redeemo account. By registering, you confirm that the information you provide is accurate and that you are legally permitted to enter into this agreement.
      </p>

      <h3>Account security</h3>
      <p>
        You are responsible for keeping your login credentials secure. Do not share your password. If you suspect unauthorised access to your account, contact us immediately at{' '}
        <a href="mailto:info@redeemo.co.uk">info@redeemo.co.uk</a>.
      </p>

      <h3>One account per person</h3>
      <p>
        Redeemo accounts are personal and non-transferable. You may not create multiple accounts or share your account with another person. Accounts found to be duplicated or shared may be suspended without notice or refund.
      </p>

      <h2>Membership and subscription</h2>

      <h3>Plans</h3>
      <p>
        Redeemo offers a free membership tier and paid subscription plans (Monthly at £6.99/month and Annual at £69.99/year). Pricing is displayed on the{' '}
        <Link href="/pricing">Pricing page</Link> and may change with 30 days&apos; notice to existing subscribers.
      </p>

      <h3>Billing</h3>
      <p>
        Paid subscriptions are billed in advance via Stripe. Your subscription renews automatically on the same date each month or year (depending on your plan) unless you cancel. By subscribing, you authorise Redeemo to charge your payment method on each renewal date.
      </p>

      <h3>Cancellation</h3>
      <p>
        You may cancel your subscription at any time from your{' '}
        <Link href="/account/subscription">Account &rsaquo; Subscription</Link> page. Cancellation takes effect at the end of your current billing period. You retain full access until that date. Redeemo does not offer refunds for unused time in the current billing period except where required by UK consumer law.
      </p>

      <h3>Free plan</h3>
      <p>
        Free members may browse merchants and view voucher details but cannot redeem vouchers. No payment method is required for a free account.
      </p>

      <h2>Vouchers and redemption</h2>

      <h3>Redemption rules</h3>
      <p>
        Paid subscribers may redeem one voucher per merchant per subscription cycle. A subscription cycle begins on the date you subscribed and renews on the same date each month or year. Unused redemptions do not carry over to the next cycle.
      </p>

      <h3>How redemption works</h3>
      <p>
        Redemption requires the Redeemo mobile app. At the merchant&apos;s premises, you enter the branch PIN in the app to generate a unique redemption code. You show the code to a member of staff, who validates it using the Redeemo Merchant App. The code is then marked as used. Redeemo does not support self-service redemption or redemption via the website.
      </p>

      <h3>Voucher availability</h3>
      <p>
        Vouchers are available while a merchant&apos;s account is active and approved. Redeemo does not guarantee that any specific merchant or voucher will remain available. Merchants may update, pause, or remove their offers at any time. If a voucher you intended to use becomes unavailable, you may contact us for assistance.
      </p>

      <h3>Merchant refusals</h3>
      <p>
        If a merchant refuses to honour a valid voucher, do not attempt to resolve it with the merchant directly. Contact Redeemo support at{' '}
        <a href="mailto:info@redeemo.co.uk">info@redeemo.co.uk</a>. Merchants who join Redeemo sign a contract committing to honour valid redemptions, and we will investigate any reported refusals.
      </p>

      <h3>Voucher terms</h3>
      <p>
        Individual vouchers may carry additional terms set by the merchant, such as minimum spend, day or time restrictions, or exclusions for specific products. These terms are displayed on the voucher detail page. Redeemo is not responsible for merchant-specific restrictions provided they are clearly stated.
      </p>

      <h2>Prohibited conduct</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Share, sell, or transfer your Redeemo account or redemption codes</li>
        <li>Attempt to redeem vouchers by misrepresenting your location or the merchant&apos;s branch PIN</li>
        <li>Create multiple accounts to circumvent the one-redemption-per-cycle rule</li>
        <li>Use automated tools or bots to scrape, access, or interact with the Redeemo platform</li>
        <li>Engage in any conduct that disrupts or damages the platform or its users</li>
        <li>Impersonate another person or misrepresent your affiliation with any person or entity</li>
      </ul>

      <h2>Content and reviews</h2>
      <p>
        If you submit a review or any other content to Redeemo, you grant us a non-exclusive, royalty-free licence to display, distribute, and promote that content on the platform. You confirm that any content you submit is accurate, does not infringe third-party rights, and does not contain defamatory, offensive, or illegal material. We reserve the right to remove content that violates these standards.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The Redeemo name, logo, design, software, and all associated intellectual property are owned by Redeemo Ltd. Nothing in these terms grants you any right to use our trademarks or intellectual property without prior written consent.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by UK law, Redeemo&apos;s total liability to you for any claims arising from your use of the platform will not exceed the amount you paid in subscription fees in the 12 months preceding the claim. Redeemo is not liable for the quality of goods or services provided by merchants, merchant refusals, or third-party service failures.
      </p>
      <p>
        Nothing in these terms limits liability for death or personal injury caused by negligence, fraud, or any other liability that cannot be excluded by law.
      </p>

      <h2>Account termination</h2>
      <p>
        We may suspend or terminate your account if we believe you have violated these terms, engaged in fraudulent activity, or for any other reason that in our reasonable judgement puts the platform or its users at risk. Where practical, we will give notice and an opportunity to resolve the issue before termination. If your account is terminated for breach of these terms, you will not receive a refund for any remaining subscription period.
      </p>

      <h2>Changes to the service and these terms</h2>
      <p>
        Redeemo may update these terms from time to time. We will notify you by email of significant changes at least 14 days before they take effect for existing subscribers. Continued use of the service after the effective date constitutes acceptance of the updated terms.
      </p>

      <h2>Governing law and disputes</h2>
      <p>
        These terms are governed by the laws of England and Wales. Any dispute arising from these terms will be subject to the exclusive jurisdiction of the courts of England and Wales, unless you are a consumer resident in another UK jurisdiction, in which case your local courts may also have jurisdiction.
      </p>
      <p>
        Before raising a formal dispute, please contact us at{' '}
        <a href="mailto:info@redeemo.co.uk">info@redeemo.co.uk</a>. We aim to resolve complaints within 5 working days.
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
