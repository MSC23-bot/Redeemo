'use client'

import Image from 'next/image'
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The owner's approved hero artwork (2026-07-08), brought to life in layers:
 * the base image stays intact (phone, ribbon, lighting), and the four voucher
 * cards, cut out of the same artwork, float over their own baked positions
 * with spring parallax and slow idle drift. Nothing is re-rendered by AI:
 * the art is the art, only the motion is code.
 *
 * Geometry: the image mounts contain-fit (the phone can never be cropped),
 * right-anchored, on a ground colour sampled from the artwork's own cream so
 * the edges are invisible at any viewport. Card layers are positioned as
 * percentages of the image box and sit scaled ~1.07 over their baked copies,
 * which keeps the originals hidden through the whole motion range.
 */

const IMG_W = 1672
const IMG_H = 941
// Ground colour sampled from the artwork's cream field
const GROUND = '#FFF5EB'

// Crop boxes of each card in source pixels (see crop-meta.json in the
// design log): left, top, width, height as fractions of the image.
const LAYERS = [
  { key: 'coffee', src: '/app-shots/hero-collage/layer-coffee.png', box: [610, 56, 384, 339], depth: 1.2, dur: 5.4 },
  { key: 'lunch', src: '/app-shots/hero-collage/layer-lunch.png', box: [526, 338, 435, 330], depth: 1.0, dur: 6.2 },
  { key: 'gym', src: '/app-shots/hero-collage/layer-gym.png', box: [1354, 141, 318, 282], depth: 0.85, dur: 5.8 },
  { key: 'pizza', src: '/app-shots/hero-collage/layer-pizza.png', box: [1304, 376, 368, 339], depth: 1.1, dur: 6.8 },
] as const

function CardLayer({
  layer,
  parX,
  parY,
  reduceMotion,
}: {
  layer: (typeof LAYERS)[number]
  parX: MotionValue<number>
  parY: MotionValue<number>
  reduceMotion: boolean
}) {
  const [l, t, w, h] = layer.box
  const x = useTransform(parX, (v) => v * layer.depth * 9)
  const y = useTransform(parY, (v) => v * layer.depth * 7)
  return (
    <motion.div
      className="absolute"
      style={{
        left: `${(l / IMG_W) * 100}%`,
        top: `${(t / IMG_H) * 100}%`,
        width: `${(w / IMG_W) * 100}%`,
        height: `${(h / IMG_H) * 100}%`,
        x: reduceMotion ? 0 : x,
        y: reduceMotion ? 0 : y,
        scale: 1.07,
      }}
    >
      <motion.div
        className="relative h-full w-full"
        animate={reduceMotion ? undefined : { y: [0, -6, 0], rotate: [0, 0.8, 0] }}
        transition={{ duration: layer.dur, repeat: Infinity, ease: 'easeInOut' }}
        style={{ filter: 'drop-shadow(0 10px 14px rgba(97,20,4,0.12))' }}
      >
        {/* Pre-cut, pre-sized assets: the optimizer's re-encode only softens
            them, so serve the exact files */}
        <Image src={layer.src} alt="" fill unoptimized />
      </motion.div>
    </motion.div>
  )
}

export function HeroCollage() {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const rawPX = useMotionValue(0)
  const rawPY = useMotionValue(0)
  const parX = useSpring(rawPX, { stiffness: 46, damping: 16, mass: 0.9 })
  const parY = useSpring(rawPY, { stiffness: 46, damping: 16, mass: 0.9 })

  // Pointer events land on the hero content above this layer, so listen on
  // the owning section.
  useEffect(() => {
    if (reduceMotion) return
    const section = ref.current?.closest('section')
    if (!section) return
    const onMove = (e: MouseEvent) => {
      const rect = section.getBoundingClientRect()
      rawPX.set((e.clientX - rect.left) / rect.width - 0.5)
      rawPY.set((e.clientY - rect.top) / rect.height - 0.5)
    }
    const onLeave = () => {
      rawPX.set(0)
      rawPY.set(0)
    }
    section.addEventListener('mousemove', onMove, { passive: true })
    section.addEventListener('mouseleave', onLeave, { passive: true })
    return () => {
      section.removeEventListener('mousemove', onMove)
      section.removeEventListener('mouseleave', onLeave)
    }
  }, [rawPX, rawPY, reduceMotion])

  // Gentle lift as the visitor scrolls away
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const lift = useScrollLinked(useTransform(scrollYProgress, [0, 1], [0, -26]))

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden" aria-hidden="true" style={{ background: GROUND }}>
      <motion.div
        className="absolute right-0 top-1/2 h-full max-w-full"
        style={{ aspectRatio: `${IMG_W} / ${IMG_H}`, y: '-50%', translateY: reduceMotion ? 0 : lift }}
      >
        <Image
          src="/app-shots/hero-collage/base-v2.jpg"
          alt=""
          fill
          priority
          unoptimized
          className="object-fill"
        />
        {LAYERS.map((layer) => (
          <CardLayer key={layer.key} layer={layer} parX={parX} parY={parY} reduceMotion={!!reduceMotion} />
        ))}

      </motion.div>

      {/* Frosted veil under the text column: invisible over plain cream, and
          anything that drifts beneath the headline at narrower viewports
          fogs into backdrop instead of colliding with the type */}
      <div
        className="absolute inset-y-0 left-0"
        style={{
          // The text column spans to 50vw - 80px (max-w-7xl, 560px column):
          // cover it fully, then fade over the last 180px
          width: 'calc(50% + 20px)',
          backdropFilter: 'blur(18px) saturate(1.05)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.05)',
          background: 'rgba(255,249,245,0.66)',
          maskImage: 'linear-gradient(90deg, black calc(100% - 180px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(90deg, black calc(100% - 180px), transparent 100%)',
        }}
      />

      {/* Melt into the page cream at the floor so the badge strip and ribbon
          divider below read over calm ground */}
      <div
        className="absolute inset-x-0 bottom-0 h-32"
        style={{ background: 'linear-gradient(180deg, rgba(255,249,245,0) 0%, rgba(255,249,245,0.97) 100%)' }}
      />
    </div>
  )
}
