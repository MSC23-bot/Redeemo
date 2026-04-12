import { HeroSection } from '@/components/landing/HeroSection'
import { HowItWorksSection } from '@/components/landing/HowItWorksSection'
import { FeaturedMerchantsSection } from '@/components/landing/FeaturedMerchantsSection'
import { CategorySection } from '@/components/landing/CategorySection'
import { SavingsStatsSection } from '@/components/landing/SavingsStatsSection'
import { AppMockupSection } from '@/components/landing/AppMockupSection'
import { TestimonialsSection } from '@/components/landing/TestimonialsSection'
import { MerchantCtaSection } from '@/components/landing/MerchantCtaSection'
import { PricingSection } from '@/components/landing/PricingSection'
import { FinalCtaSection } from '@/components/landing/FinalCtaSection'

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <PricingSection />
      <FeaturedMerchantsSection />
      <CategorySection />
      <AppMockupSection />
      <SavingsStatsSection />
      <TestimonialsSection />
      <FinalCtaSection />
      <MerchantCtaSection />
    </>
  )
}
