'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'

type Category = { id: string; name: string }

export function CategoryFilterBar({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const active = searchParams.get('categoryId')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="overflow-x-auto scrollbar-none bg-[#FAF8F5] border-b border-navy/[0.06] sticky top-[64px] z-10"
    >
      <div className="flex gap-2 px-6 py-3" style={{ width: 'max-content' }}>
        <button
          onClick={() => {
            const next = new URLSearchParams(searchParams.toString())
            next.delete('categoryId')
            router.push(`/discover?${next}`)
          }}
          className={`font-mono text-[11px] tracking-[0.08em] uppercase px-4 py-2 rounded-full border transition-colors flex-shrink-0 ${
            !active
              ? 'bg-navy text-white border-navy'
              : 'bg-white text-navy/55 border-navy/[0.12] hover:border-navy/30'
          }`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => {
              const next = new URLSearchParams(searchParams.toString())
              next.set('categoryId', cat.id)
              router.push(`/discover?${next}`)
            }}
            className={`font-mono text-[11px] tracking-[0.08em] uppercase px-4 py-2 rounded-full border transition-colors flex-shrink-0 ${
              active === cat.id
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-navy/55 border-navy/[0.12] hover:border-navy/30'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
