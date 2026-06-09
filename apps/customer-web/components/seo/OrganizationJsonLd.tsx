// Organization structured data (schema.org JSON-LD), rendered once in the root
// layout. No `sameAs` until a real verified social handle exists (owner decision,
// 2026-06-09). WebSite/SearchAction, LocalBusiness, Product, Offer, and FAQPage
// are deferred to a post-launch follow-up.
const ORG_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Redeemo',
  url: 'https://redeemo.co.uk',
  logo: 'https://redeemo.co.uk/logo-light.png',
  description:
    'A membership for finding quality local places and using member vouchers included with your subscription.',
}

export function OrganizationJsonLd() {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
    />
  )
}
