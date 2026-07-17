'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useInView, useReducedMotion } from 'framer-motion'
import type { MotionValue } from 'framer-motion'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Ambient ember/bokeh field for the for-businesses cinematic hero. The
 * night-street photograph carries warm blurred lights; this layer extends
 * them into gentle drifting particles so the scene breathes. Density is
 * biased to the right (the photographic half); the left stays calm under
 * the headline.
 *
 * Same guards as VoucherCards3D / RibbonScene3D: client-only mount,
 * reduced-motion returns null, render loop stops offscreen, dpr capped.
 */

const COUNT = 96

// Warm amber bokeh with occasional brand-red and cool window-blue sparks,
// matching the street lights already in the photograph.
const PALETTE = ['#FFB86B', '#FFD9A8', '#FF8A5C', '#E20C04', '#9FB6FF']
const WEIGHTS = [0.38, 0.28, 0.16, 0.08, 0.1]

function pickColor(r: number): string {
  let acc = 0
  for (let i = 0; i < PALETTE.length; i++) {
    acc += WEIGHTS[i]
    if (r <= acc) return PALETTE[i]
  }
  return PALETTE[0]
}

// Deterministic pseudo-random (seeded), so SSR/CSR and re-mounts agree.
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeSpriteTexture(): THREE.CanvasTexture {
  const S = 64
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

type Particle = {
  x: number
  y: number
  z: number
  riseSpeed: number
  swayAmp: number
  swayFreq: number
  phase: number
  twinkleFreq: number
}

function EmberField({ progress }: { progress: MotionValue<number> | null }) {
  const pointsRef = useRef<THREE.Points>(null)
  const groupRef = useRef<THREE.Group>(null)

  const { particles, geometry, texture } = useMemo(() => {
    const rand = mulberry32(20260715)
    const parts: Particle[] = []
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    const sizes = new Float32Array(COUNT)
    const c = new THREE.Color()
    for (let i = 0; i < COUNT; i++) {
      // Bias x to the right half of the stage (the photographic side);
      // the headline column on the left stays clean.
      const xr = Math.pow(rand(), 0.58)
      const x = -3.2 + xr * 9.4
      const y = -3.4 + rand() * 6.8
      const z = -2.6 + rand() * 2.4
      parts.push({
        x,
        y,
        z,
        riseSpeed: 0.045 + rand() * 0.11,
        swayAmp: 0.12 + rand() * 0.3,
        swayFreq: 0.12 + rand() * 0.3,
        phase: rand() * Math.PI * 2,
        twinkleFreq: 0.3 + rand() * 0.9,
      })
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      c.set(pickColor(rand()))
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
      sizes[i] = 0.05 + rand() * 0.16
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return { particles: parts, geometry: geo, texture: makeSpriteTexture() }
  }, [])

  useEffect(
    () => () => {
      geometry.dispose()
      texture.dispose()
    },
    [geometry, texture],
  )

  useFrame(({ clock, pointer }) => {
    const pts = pointsRef.current
    const group = groupRef.current
    if (!pts || !group) return
    const t = clock.elapsedTime
    const pos = pts.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < COUNT; i++) {
      const p = particles[i]
      // Slow rise with wrap, plus lateral sway and per-particle depth bob
      let y = p.y + ((t * p.riseSpeed + p.phase) % 7.4)
      if (y > 3.7) y -= 7.4
      pos.setXYZ(i, p.x + Math.sin(t * p.swayFreq + p.phase) * p.swayAmp, y, p.z)
    }
    pos.needsUpdate = true
    // Pointer parallax (gentle) + scroll drift
    const scroll = progress ? progress.get() : 0
    group.position.x = THREE.MathUtils.lerp(group.position.x, pointer.x * 0.22, 0.04)
    group.position.y = THREE.MathUtils.lerp(group.position.y, pointer.y * 0.12 + scroll * 0.85, 0.06)
    // Twinkle via material opacity wave (whole-field, subtle)
    const mat = pts.material as THREE.PointsMaterial
    mat.opacity = 0.5 + Math.sin(t * 0.5) * 0.08
  })

  return (
    <group ref={groupRef}>
      <points ref={pointsRef} geometry={geometry}>
        <pointsMaterial
          map={texture}
          vertexColors
          transparent
          opacity={0.55}
          size={0.14}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}

export function HeroEmbers({ progress }: { progress?: MotionValue<number> | null }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const inView = useInView(wrapRef, { margin: '200px' })
  const reduceMotion = useReducedMotion()

  if (reduceMotion) return null

  return (
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <Canvas
        frameloop={inView ? 'always' : 'never'}
        dpr={[1, 1.75]}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 35, position: [0, 0, 9] }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <EmberField progress={progress ?? null} />
      </Canvas>
    </div>
  )
}
