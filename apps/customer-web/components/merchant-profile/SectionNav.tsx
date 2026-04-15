'use client'
import { motion } from 'framer-motion'

type Section = { id: string; label: string }

export function SectionNav({ sections }: { sections: Section[] }) {
  if (sections.length === 0) return null

  return (
    <nav
      aria-label="Merchant sections"
      className="sticky top-[64px] z-10 bg-white/96 backdrop-blur-sm border-b border-[#EDE8E8] overflow-x-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      <div className="max-w-7xl mx-auto flex gap-2 px-6 py-3" style={{ width: 'max-content' }}>
        {sections.map((s, i) => (
          <motion.a
            key={s.id}
            href={`#${s.id}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="text-[12px] font-semibold tracking-[0.04em] text-white px-4 py-1.5 rounded-full whitespace-nowrap no-underline cursor-pointer"
            style={{ background: '#010C35' }}
          >
            {s.label}
          </motion.a>
        ))}
      </div>
    </nav>
  )
}
