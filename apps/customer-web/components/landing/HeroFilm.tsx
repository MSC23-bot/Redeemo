'use client'

import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { useScrollLinked } from './scroll'

/**
 * The owner-made Higgsfield hero film (2026-07-07): phone centre-right,
 * voucher cards and the brand ribbon floating around it, left third clean
 * for the headline. The film was generated with a LOCKED camera; all camera
 * feel happens here in code so it stays crisp and responds to the visitor:
 *   scroll: slow push-in and a gentle parallax lift
 *   cursor: the whole stage tilts a few degrees toward the pointer
 * Reduced-motion visitors get the still poster, no video, no tilt.
 */
export function HeroFilm() {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })
  // Push-in as the visitor scrolls away: the camera move Higgsfield didn't make
  const scale = useScrollLinked(useTransform(scrollYProgress, [0, 1], [1, 1.08]))
  const y = useScrollLinked(useTransform(scrollYProgress, [0, 1], [0, 46]))

  // Cursor tilt, spring-smoothed
  const rawTX = useMotionValue(0)
  const rawTY = useMotionValue(0)
  const tiltX = useSpring(rawTX, { stiffness: 60, damping: 18, mass: 0.8 })
  const tiltY = useSpring(rawTY, { stiffness: 60, damping: 18, mass: 0.8 })

  // The film sits behind the hero content, so pointer events land on the
  // section, not on this layer: listen on the owning section instead.
  useEffect(() => {
    if (reduceMotion) return
    const parent = ref.current?.closest('section')
    if (!parent) return
    const onMove = (e: MouseEvent) => {
      const rect = parent.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width - 0.5
      const py = (e.clientY - rect.top) / rect.height - 0.5
      rawTY.set(px * 4.5) // rotateY follows horizontal pointer travel
      rawTX.set(py * -3) // rotateX follows vertical, inverted (screen physics)
    }
    const onLeave = () => {
      rawTX.set(0)
      rawTY.set(0)
    }
    parent.addEventListener('mousemove', onMove, { passive: true })
    parent.addEventListener('mouseleave', onLeave, { passive: true })
    return () => {
      parent.removeEventListener('mousemove', onMove)
      parent.removeEventListener('mouseleave', onLeave)
    }
  }, [rawTX, rawTY, reduceMotion])

  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden"
      style={{ perspective: 1400 }}
      aria-hidden="true"
    >
      <motion.div
        className="absolute inset-0"
        style={
          reduceMotion
            ? undefined
            : { scale, y, rotateX: tiltX, rotateY: tiltY, transformStyle: 'preserve-3d' }
        }
      >
        {reduceMotion ? (
          <img
            src="/app-motion/hero-film.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: '82% 42%' }}
          />
        ) : (
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster="/app-motion/hero-film.jpg"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: '82% 42%' }}
          >
            <source src="/app-motion/hero-film.mp4" type="video/mp4" />
          </video>
        )}
        {/* Left half settles toward the page cream so the headline always
            sits on calm ground, whatever the film is doing */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, #FFF9F5 0%, #FFF9F5 24%, rgba(255,249,245,0.94) 38%, rgba(255,249,245,0) 58%)',
          }}
        />
        {/* Soft floor fade so the badge strip below reads over calm ground */}
        <div
          className="absolute inset-x-0 bottom-0 h-36"
          style={{
            background: 'linear-gradient(180deg, rgba(255,249,245,0) 0%, rgba(255,249,245,0.9) 100%)',
          }}
        />
      </motion.div>
    </div>
  )
}
