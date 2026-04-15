'use client'
import Image from 'next/image'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Props = {
  photos: string[]
  merchantName: string
}

export function PhotoGallerySection({ photos, merchantName }: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  const visible = photos.slice(0, 5)

  if (visible.length === 0) return null

  const open = (i: number) => setLightbox(i)
  const close = () => setLightbox(null)
  const prev = () => setLightbox(i => (i! - 1 + visible.length) % visible.length)
  const next = () => setLightbox(i => (i! + 1) % visible.length)

  return (
    <motion.section
      id="photos"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-7xl mx-auto px-6 py-10 md:py-12 border-b border-[#EDE8E8]"
    >
      <div className="flex items-center justify-between mb-5">
        <h2
          className="font-display text-[#010C35] leading-tight"
          style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', letterSpacing: '-0.2px' }}
        >
          Photos
        </h2>
        <span className="text-[12px] text-[#9CA3AF]">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Gallery grid */}
      {visible.length === 1 && (
        <div className="relative h-[260px] md:h-[340px] rounded-2xl overflow-hidden cursor-pointer" onClick={() => open(0)}>
          <Image src={visible[0]} alt={`${merchantName} photo`} fill className="object-cover hover:scale-[1.02] transition-transform duration-500" sizes="100vw" />
        </div>
      )}

      {visible.length === 2 && (
        <div className="grid grid-cols-2 gap-2 h-[260px]">
          {visible.map((src, i) => (
            <div key={i} className="relative rounded-2xl overflow-hidden cursor-pointer" onClick={() => open(i)}>
              <Image src={src} alt={`${merchantName} photo ${i + 1}`} fill className="object-cover hover:scale-[1.02] transition-transform duration-500" sizes="50vw" />
            </div>
          ))}
        </div>
      )}

      {visible.length >= 3 && (
        <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[280px] md:h-[340px]">
          {/* First image — tall, spans 2 rows and 2 cols */}
          <div className="col-span-2 row-span-2 relative rounded-2xl overflow-hidden cursor-pointer" onClick={() => open(0)}>
            <Image src={visible[0]} alt={`${merchantName} photo 1`} fill className="object-cover hover:scale-[1.02] transition-transform duration-500" sizes="(max-width: 768px) 50vw, 40vw" />
          </div>
          {/* Remaining images */}
          {visible.slice(1, 5).map((src, i) => (
            <div key={i} className="relative rounded-xl overflow-hidden cursor-pointer" onClick={() => open(i + 1)}>
              <Image src={src} alt={`${merchantName} photo ${i + 2}`} fill className="object-cover hover:scale-[1.03] transition-transform duration-500" sizes="(max-width: 768px) 25vw, 20vw" />
              {/* "View all" overlay on last visible */}
              {i === 3 && photos.length > 5 && (
                <div className="absolute inset-0 bg-[#010C35]/60 flex items-center justify-center">
                  <span className="text-white font-bold text-[13px]">+{photos.length - 5} more</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={close}
          >
            <button
              onClick={close}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <motion.div
              key={lightbox}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-4xl aspect-[4/3]"
              onClick={e => e.stopPropagation()}
            >
              <Image src={visible[lightbox]} alt={`${merchantName} photo ${lightbox + 1}`} fill className="object-contain" sizes="90vw" />
            </motion.div>

            {visible.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); prev() }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
                  aria-label="Previous photo"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); next() }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
                  aria-label="Next photo"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </>
            )}

            <div className="absolute bottom-4 text-white/60 text-[12px]">
              {lightbox + 1} / {visible.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}
