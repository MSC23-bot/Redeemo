'use client'
import { motion } from 'framer-motion'

type Props = {
  about: string | null
}

export function AboutSection({ about }: Props) {
  if (!about) return null

  return (
    <motion.section
      id="about"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-7xl mx-auto px-6 py-10 md:py-12 border-b border-[#EDE8E8]"
    >
      <h2
        className="font-display text-[#010C35] leading-tight mb-5"
        style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
      >
        About
      </h2>
      <p className="text-[15px] md:text-[16px] text-[#4B5563] leading-[1.78] max-w-[680px] whitespace-pre-line">
        {about}
      </p>
    </motion.section>
  )
}
