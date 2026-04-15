'use client'

import { motion } from 'framer-motion'

type Testimonial = {
  quote: string
  name: string
  location: string
  since: string
  stars: number
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote: 'I saved more than my subscription cost in the first week. The restaurants are actually places I want to go.',
    name: 'Sarah M.',
    location: 'Manchester',
    since: 'member since Jan 2026',
    stars: 5,
  },
  {
    quote: 'Nothing like Groupon. The vouchers are at places worth going to. I\u2019ve found three spots I visit every month.',
    name: 'James K.',
    location: 'Leeds',
    since: 'member since Feb 2026',
    stars: 5,
  },
]

function Stars({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5 mb-5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="#FBBF24" aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      ))}
    </div>
  )
}

export function TestimonialsSection() {
  return (
    <section
      className="relative overflow-hidden py-20 md:py-24 px-6"
      style={{ background: '#010C35' }}
    >
      {/* Red radial glow */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(600px circle at 100% 110%, rgba(226,12,4,0.22), transparent 54%), radial-gradient(400px circle at 0% -10%, rgba(200,50,0,0.12), transparent 50%)',
        }}
      />


<div className="relative max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="text-center mb-12"
        >
          <span className="inline-block text-[11px] font-bold tracking-[0.18em] uppercase text-white/40 mb-4">
            Member reviews
          </span>
          <h2
            className="font-display text-white leading-[1.1]"
            style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.3px' }}
          >
            What members say
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[980px] mx-auto">
          {TESTIMONIALS.map((t, i) => (
            <motion.figure
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{
                duration: 0.5,
                delay: i * 0.12,
                ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
              }}
              className="rounded-2xl p-8"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(16px)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
              }}
            >
              <Stars count={t.stars} />
              <blockquote className="text-[16px] text-white/85 leading-[1.65] mb-6 font-normal">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="flex items-center gap-3">
                {/* Avatar placeholder */}
                <div
                  className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[13px] font-bold text-white"
                  style={{ background: 'rgba(226,12,4,0.6)' }}
                  aria-hidden="true"
                >
                  {t.name[0]}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white leading-none mb-1">{t.name}</p>
                  <p className="text-[12px] text-white/38">{t.location} · {t.since}</p>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}
