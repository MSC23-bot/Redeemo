'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useInView, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

/**
 * The brand ribbon as a live WebGL object, reusable through the landing page
 * (owner 2026-07-12: 3D through the page; the hero band must flow AWAY from
 * the artwork side; the static break ribbons are gone, this is the ribbon's
 * home now). A swept rectangular cross-section with duplicated vertices per
 * face so the edges stay crisp. ~220 rings recomputed per frame: cheap.
 *
 * Mount inside a positioned wrapper; the canvas fills it. Reduced-motion
 * visitors get nothing (static art carries the page for them), and the
 * render loop stops whenever the wrapper leaves the viewport.
 */

const RINGS = 220

type Preset = {
  speed: number
  halfW: number
  halfT: number
  span: number
  yBase: number
  ampY: number
  ampY2: number
  ampZ: number
  zBase: number
  color: string
  ambient: number
  key: number
  rim: number
}

const PRESETS: Record<'hero' | 'navy', Preset> = {
  // Cream hero, left side: a soft current under the copy, behind the veil
  hero: {
    speed: 1,
    halfW: 0.72,
    halfT: 0.055,
    span: 30,
    yBase: 0.5,
    ampY: 1.9,
    ampY2: 0.45,
    ampZ: 1.5,
    zBase: -1.3,
    color: '#DE1004',
    ambient: 0.85,
    key: 1.5,
    rim: 0.5,
  },
  // Navy sections: slower, narrower, deeper, and biased low so it grazes
  // beneath the content more often than through it
  navy: {
    speed: 0.55,
    halfW: 0.6,
    halfT: 0.05,
    span: 34,
    yBase: -1.0,
    ampY: 1.2,
    ampY2: 0.35,
    ampZ: 1.2,
    zBase: -2.0,
    color: '#E20C04',
    ambient: 0.5,
    key: 1.3,
    rim: 0.7,
  },
}

function RibbonMesh({ p }: { p: Preset }) {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    const vertCount = 4 * (RINGS + 1) * 2
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3))
    const indices: number[] = []
    for (let s = 0; s < 4; s++) {
      const base = s * (RINGS + 1) * 2
      for (let i = 0; i < RINGS; i++) {
        const a = base + i * 2
        const b = a + 1
        const c = a + 2
        const d = a + 3
        indices.push(a, b, c, b, d, c)
      }
    }
    geom.setIndex(indices)
    return geom
  }, [])

  const scratch = useMemo(
    () => ({
      c: new THREE.Vector3(),
      T: new THREE.Vector3(),
      U: new THREE.Vector3(),
      V: new THREE.Vector3(),
      corner: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
      p0: new THREE.Vector3(),
      p1: new THREE.Vector3(),
    }),
    [],
  )

  useFrame(({ clock }) => {
    const time = clock.elapsedTime * p.speed
    const pos = geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const { c, T, U, V, corner, p0, p1 } = scratch

    const path = (t: number, out: THREE.Vector3) => {
      out.set(
        (t - 0.5) * p.span,
        p.yBase + p.ampY * Math.sin(t * Math.PI * 2.2 + time * 0.42) + p.ampY2 * Math.sin(t * Math.PI * 4.6 - time * 0.27),
        p.zBase + p.ampZ * Math.sin(t * Math.PI * 1.4 + time * 0.33),
      )
    }

    for (let i = 0; i <= RINGS; i++) {
      const t = i / RINGS
      path(t, c)
      path(Math.min(1, t + 0.004), p1)
      path(Math.max(0, t - 0.004), p0)
      T.subVectors(p1, p0).normalize()
      U.set(0, 1, 0)
      U.addScaledVector(T, -U.dot(T)).normalize()
      V.crossVectors(T, U).normalize()
      const twist = 1.05 * Math.sin(t * Math.PI * 1.8 + time * 0.5) + 0.35 * Math.sin(time * 0.21)
      const cos = Math.cos(twist)
      const sin = Math.sin(twist)
      const ux = U.x * cos + V.x * sin
      const uy = U.y * cos + V.y * sin
      const uz = U.z * cos + V.z * sin
      V.set(V.x * cos - U.x * sin, V.y * cos - U.y * sin, V.z * cos - U.z * sin)
      U.set(ux, uy, uz)

      corner[0].copy(c).addScaledVector(U, p.halfW).addScaledVector(V, p.halfT)
      corner[1].copy(c).addScaledVector(U, -p.halfW).addScaledVector(V, p.halfT)
      corner[2].copy(c).addScaledVector(U, -p.halfW).addScaledVector(V, -p.halfT)
      corner[3].copy(c).addScaledVector(U, p.halfW).addScaledVector(V, -p.halfT)

      for (let s = 0; s < 4; s++) {
        const a = corner[s]
        const b = corner[(s + 1) % 4]
        const idx = (s * (RINGS + 1) + i) * 2 * 3
        arr[idx] = a.x
        arr[idx + 1] = a.y
        arr[idx + 2] = a.z
        arr[idx + 3] = b.x
        arr[idx + 4] = b.y
        arr[idx + 5] = b.z
      }
    }
    pos.needsUpdate = true
    geometry.computeVertexNormals()
  })

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <meshStandardMaterial color={p.color} roughness={0.34} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
  )
}

export function RibbonScene3D({ preset }: { preset: keyof typeof PRESETS }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const inView = useInView(wrapRef, { margin: '200px' })
  const reduceMotion = useReducedMotion()
  // On small screens the band reads as a sliver (owner 2026-07-13): a
  // narrow viewport shows a thin slice of a 30-unit-wide path. Shorten the
  // span and thicken the band so it carries the same presence per pixel.
  const [small, setSmall] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const update = () => setSmall(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  const base = PRESETS[preset]
  const p = small
    ? { ...base, halfW: base.halfW * 1.55, span: base.span * 0.5, ampY: base.ampY * 1.2, zBase: base.zBase + 0.7 }
    : base

  if (reduceMotion) return null

  return (
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <Canvas
        frameloop={inView ? 'always' : 'never'}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 35, position: [0, 0, 13] }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <ambientLight intensity={p.ambient} color="#FFF4EC" />
        <directionalLight position={[4, 6, 8]} intensity={p.key} color="#FFFFFF" />
        <directionalLight position={[-6, -3, -4]} intensity={p.rim} color="#FF9070" />
        <RibbonMesh p={p} />
      </Canvas>
    </div>
  )
}
