'use client'
import { motion } from 'framer-motion'

const steps = [
  {
    number: '01',
    title: 'Create your merchant profile',
    body: 'Register online. Fill in your business details, upload photos, and add your branch locations. The web portal guides you through every step.',
    detail: 'Takes around 15 minutes. You control your profile and can update it any time.',
  },
  {
    number: '02',
    title: 'Add your two mandatory vouchers',
    body: 'Every merchant on Redeemo offers two standard vouchers as part of the marketplace agreement. These are the baseline offers that subscribers can redeem once per cycle.',
    detail: 'You choose the offer type: BOGO, discount, freebie, package deal, and more. Your vouchers, your terms.',
  },
  {
    number: '03',
    title: 'Get approved by the Redeemo team',
    body: "Our team reviews your profile for completeness and quality. You'll be notified by email once approved.",
    detail: 'We approve businesses that meet our quality standards and offer genuine local value.',
  },
  {
    number: '04',
    title: 'Go live and start welcoming subscribers',
    body: 'Once approved, your business appears in local discovery feeds. Subscribers can find your vouchers, save them to favourites, and redeem in-store.',
    detail: 'Your branch staff validate redemptions in seconds using the Redeemo merchant app.',
  },
]

export function HowMerchantsWork() {
  return (
    <section id="how-it-works" className="bg-surface-muted py-24 px-6">
      <div className="max-w-screen-xl mx-auto">
        <div className="text-center mb-20">
          <p className="font-mono text-xs tracking-[0.12em] uppercase text-red mb-4">Onboarding</p>
          <h2 className="font-display text-[clamp(30px,3.5vw,48px)] font-normal text-navy leading-[1.15]">
            From sign-up to live in days
          </h2>
        </div>

        <div className="flex flex-col gap-16">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center"
            >
              {/* Copy block */}
              <div className={i % 2 === 0 ? 'lg:order-1' : 'lg:order-2'}>
                <div className="flex items-center gap-4 mb-5">
                  <span
                    className="font-mono text-sm font-medium text-white w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #E2000C, #EE6904)' }}
                  >
                    {step.number}
                  </span>
                  <h3 className="font-display text-2xl text-navy leading-snug">{step.title}</h3>
                </div>
                <p className="text-base leading-relaxed text-navy/65 mb-4">{step.body}</p>
                <p className="text-sm leading-relaxed text-navy/45 border-l-2 border-red pl-4">{step.detail}</p>
              </div>

              {/* Visual placeholder */}
              <div className={`h-64 lg:h-72 rounded-2xl bg-white border border-navy/[0.08] flex items-center justify-center shadow-sm ${i % 2 === 0 ? 'lg:order-2' : 'lg:order-1'}`}>
                <span className="font-mono text-xs text-navy/20 tracking-widest uppercase">Step {step.number} illustration</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
