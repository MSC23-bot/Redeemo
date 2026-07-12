'use client'

import Image from 'next/image'
import dynamic from 'next/dynamic'
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { useScrollLinked } from './scroll'

// WebGL is client-only; the hero must never block on it
const RibbonScene3D = dynamic(() => import('./RibbonScene3D').then((m) => m.RibbonScene3D), { ssr: false })

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
  { key: 'coffee', img: '/app-shots/hero-collage/layer-coffee.png', mask: '/app-shots/hero-collage/layer-coffee.png', box: [610, 56, 384, 339], dur: 5.4 },
  { key: 'lunch', img: '/app-shots/hero-collage/layer-lunch.png', mask: '/app-shots/hero-collage/layer-lunch.png', box: [526, 338, 435, 330], dur: 6.2 },
  { key: 'gym', img: '/app-shots/hero-collage/layer-gym.png', mask: '/app-shots/hero-collage/layer-gym.png', box: [1354, 141, 318, 282], dur: 5.8 },
  { key: 'pizza', img: '/app-shots/hero-collage/layer-pizza.png', mask: '/app-shots/hero-collage/layer-pizza.png', box: [1304, 376, 368, 339], dur: 6.8 },
] as const

function CardLayer({
  layer,
  reduceMotion,
}: {
  layer: (typeof LAYERS)[number]
  reduceMotion: boolean
}) {
  const [l, t, w, h] = layer.box
  return (
    <motion.div
      className="absolute"
      initial="rest"
      animate="rest"
      whileHover={reduceMotion ? undefined : 'hover'}
      style={{
        left: `${(l / IMG_W) * 100}%`,
        top: `${(t / IMG_H) * 100}%`,
        width: `${(w / IMG_W) * 100}%`,
        height: `${(h / IMG_H) * 100}%`,
      }}
    >
      {/* Hover: the card presents itself: rises toward the viewer with a
          deeper shadow while its neighbours keep idling */}
      <motion.div
        className="relative h-full w-full"
        variants={{
          rest: { scale: 1.04, filter: 'drop-shadow(0 0px 0px rgba(97,20,4,0))' },
          hover: { scale: 1.1, filter: 'drop-shadow(0 18px 26px rgba(97,20,4,0.2))' },
        }}
        transition={{ type: 'spring', stiffness: 240, damping: 20 }}
      >
        <motion.div
          className="relative h-full w-full"
          animate={reduceMotion ? undefined : { y: [0, -3, 0], rotate: [0, 0.4, 0] }}
          transition={{ duration: layer.dur, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Pre-cut, pre-sized assets: the optimizer's re-encode only
              softens them, so serve the exact files */}
          <Image src={layer.img} alt="" fill unoptimized />
          {/* A single light sweep across the satin of the card, clipped to
              its die-cut silhouette by its own alpha */}
          <motion.div
            className="absolute inset-0"
            style={{
              WebkitMaskImage: `url(${layer.mask})`,
              maskImage: `url(${layer.mask})`,
              WebkitMaskSize: '100% 100%',
              maskSize: '100% 100%',
              background:
                'linear-gradient(105deg, rgba(255,255,255,0) 42%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 58%)',
              backgroundSize: '260% 100%',
            }}
            variants={{
              rest: { backgroundPosition: '135% 0%' },
              hover: { backgroundPosition: '-35% 0%' },
            }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        </motion.div>
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
  // The whole artwork leans toward the cursor as one object
  const groupX = useTransform(parX, (v) => v * 14)
  const groupRY = useTransform(parX, (v) => v * 2.5)

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden" aria-hidden="true" style={{ background: GROUND, pointerEvents: 'auto', perspective: 1600 }}>
      {/* The live 3D brand ribbon flows through the LEFT side only (owner
          2026-07-12: the artwork side was too busy with the band behind it):
          the canvas stops at 58% and fades out before the artwork begins */}
      {!reduceMotion && (
        <div
          className="absolute inset-y-0 left-0 pointer-events-none"
          style={{
            width: '58%',
            maskImage: 'linear-gradient(90deg, black 62%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(90deg, black 62%, transparent 100%)',
          }}
        >
          <RibbonScene3D preset="hero" />
        </div>
      )}
      {/* 76% height: the group breathes instead of pressing the edges */}
      <motion.div
        className="absolute right-[4%] top-1/2 h-[76%] max-w-[92%]"
        style={{
          aspectRatio: `${IMG_W} / ${IMG_H}`,
          y: '-50%',
          translateY: reduceMotion ? 0 : lift,
          translateX: reduceMotion ? 0 : groupX,
          rotateY: reduceMotion ? 0 : groupRY,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* The artwork's cream is not perfectly uniform, so its rectangle
            printed a faint edge against the ground: feather all four borders
            and it melts in. Cards are outside this mask on purpose. */}
        <Image
          src="/app-shots/hero-collage/base-v5.jpg"
          alt=""
          fill
          priority
          unoptimized
          className="object-fill"
          style={{
            maskImage:
              'linear-gradient(90deg, transparent 0, black 70px, black calc(100% - 70px), transparent 100%), linear-gradient(180deg, transparent 0, black 70px, black calc(100% - 70px), transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(90deg, transparent 0, black 70px, black calc(100% - 70px), transparent 100%), linear-gradient(180deg, transparent 0, black 70px, black calc(100% - 70px), transparent 100%)',
            maskComposite: 'intersect',
            WebkitMaskComposite: 'source-in',
          }}
        />
        {LAYERS.map((layer) => (
          <CardLayer key={layer.key} layer={layer} reduceMotion={!!reduceMotion} />
        ))}

      </motion.div>

      {/* Frosted veil under the text column: invisible over plain cream, and
          anything that drifts beneath the headline at narrower viewports
          fogs into backdrop instead of colliding with the type */}
      <div
        className="absolute inset-y-0 left-0 pointer-events-none"
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
        className="absolute inset-x-0 bottom-0 h-32 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(255,249,245,0) 0%, rgba(255,249,245,0.97) 100%)' }}
      />
    </div>
  )
}

/**
 * The same artwork for mobile (owner 2026-07-13: the phone-CSS demo was not
 * the hero image): the full collage sits beneath the copy, the voucher-card
 * layers keep their idle drift, and the live 3D ribbon flows behind it,
 * peeking out around the artwork's edges.
 */
export function HeroCollageMobile() {
  const reduceMotion = useReducedMotion()
  return (
    <div className="relative" aria-hidden="true">
      {!reduceMotion && (
        <div className="absolute -inset-x-6 -top-14 -bottom-8 pointer-events-none">
          <RibbonScene3D preset="hero" />
        </div>
      )}
      <div className="relative w-full" style={{ aspectRatio: `${IMG_W} / ${IMG_H}` }}>
        <Image
          src="/app-shots/hero-collage/base-v5.jpg"
          alt=""
          fill
          priority
          unoptimized
          className="object-fill"
          style={{
            // Full-bleed sideways; feather only top and bottom so the
            // artwork's cream melts into the page above and below
            maskImage:
              'linear-gradient(180deg, transparent 0, black 22px, black calc(100% - 22px), transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(180deg, transparent 0, black 22px, black calc(100% - 22px), transparent 100%)',
          }}
        />
        {LAYERS.map((layer) => (
          <CardLayer key={layer.key} layer={layer} reduceMotion={!!reduceMotion} />
        ))}
      </div>
    </div>
  )
}
