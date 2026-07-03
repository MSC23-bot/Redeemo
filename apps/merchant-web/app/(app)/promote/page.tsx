import type { Metadata } from 'next'
import { Star, MapPin, TrendingUp } from '@/lib/icons'
import { ComingSoonModule } from '@/components/shell/ComingSoonModule'

export const metadata: Metadata = { title: 'Promote · Redeemo for Business' }

// Prototype teaser content (minus the "Notify me" interest CTA, which needs an
// interest-storage backend - recorded deviation in the shell-wave plan).
export default function PromotePage() {
  return (
    <ComingSoonModule
      eyebrow="Grow your business"
      title="Promote"
      intro="Reach more customers with featured placement and location-targeted campaigns. Promote puts your business in front of Redeemo members near you, right when they are choosing where to go."
      cards={[
        {
          icon: Star,
          title: 'Featured placement',
          body: 'Appear at the top of the home feed for members near your branches, with a distinctive featured card.',
        },
        {
          icon: MapPin,
          title: 'Location targeted campaigns',
          body: 'Run banner campaigns aimed at members within a radius you choose around each branch.',
        },
        {
          icon: TrendingUp,
          title: 'Featured and trending status',
          body: 'See when your business is trending with members and turn busy periods into repeat visits.',
        },
      ]}
      footnote="These tools are on the way. Nothing here is live or chargeable yet. We will let you know the moment Promote opens."
    />
  )
}
