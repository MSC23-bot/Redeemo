import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { VerificationBanners } from '@/components/layout/VerificationBanners'
import { SubscriptionNudge } from '@/components/layout/SubscriptionNudge'
import { AuthProvider } from '@/contexts/AuthContext'
import { MotionProvider } from '@/components/shared/MotionProvider'
import { OrganizationJsonLd } from '@/components/seo/OrganizationJsonLd'

const SITE_URL = 'https://redeemo.co.uk'
const DEFAULT_TITLE = 'Redeemo: Save with Member Vouchers at Local Places'
const DEFAULT_DESCRIPTION =
  'Find independent restaurants, cafés, gyms, and studios near you. Join Redeemo to use exclusive member vouchers and save every month. Browse free, no card needed.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: '%s | Redeemo',
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: 'Redeemo',
  // No root-level `alternates.canonical`: it would be inherited by every child
  // route, canonicalising /pricing, /faq, /for-businesses, etc. to the homepage.
  // With no canonical tag each page self-canonicalises to its own apex URL
  // (www->apex 308 handles the host). Per-page canonicals can be added later.
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'Redeemo',
    locale: 'en_GB',
    url: SITE_URL,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  robots: { index: true, follow: true },
}

// No fixed themeColor: iOS tints its bars from the content under them, so a
// navy hero gets navy chrome and the cream sections get light chrome (a fixed
// value pinned dark bars over light sections; owner 2026-07-17)
export const viewport: Viewport = {}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <OrganizationJsonLd />
        <AuthProvider>
          <MotionProvider>
            <Navbar />
            <VerificationBanners />
            <SubscriptionNudge />
            <main>{children}</main>
            <Footer />
          </MotionProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
