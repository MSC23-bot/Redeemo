'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useInView, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

/**
 * The merchant's own product in 3D (owner 2026-07-13: for-businesses gets
 * its own WebGL, NOT the ribbon): die-cut voucher cards, the thing a
 * business designs on Redeemo, drifting and turning slowly in the hero.
 * Extruded rounded rectangles with real semicircular notches cut into the
 * side edges, in the brand palette.
 *
 * Same guards as RibbonScene3D: client-only mount, reduced-motion returns
 * null, render loop stops offscreen, dpr capped.
 */

type CardSpec = {
  pos: [number, number, number]
  colour: string
  scale: number
  speed: number
  phase: number
  axis: [number, number, number]
}

const CARDS: CardSpec[] = [
  { pos: [3.3, 0.5, -0.9], colour: '#E20C04', scale: 0.95, speed: 0.28, phase: 0.0, axis: [0.2, 1, 0.12] },
  { pos: [4.8, -0.9, -1.8], colour: '#E8500A', scale: 0.8, speed: 0.22, phase: 1.7, axis: [0.5, 0.8, 0.2] },
  { pos: [2.2, -1.5, -2.6], colour: '#FFF9F5', scale: 0.65, speed: 0.18, phase: 3.1, axis: [0.15, 1, 0.4] },
  { pos: [4.9, 1.7, -3.2], colour: '#9E0802', scale: 0.75, speed: 0.24, phase: 4.4, axis: [0.3, 0.9, 0.1] },
  { pos: [1.4, 1.7, -3.6], colour: '#E8500A', scale: 0.55, speed: 0.2, phase: 5.6, axis: [0.4, 0.7, 0.3] },
]

// The voucher outline: rounded rectangle with a semicircular die-cut notch
// centred on each vertical edge.
function makeVoucherGeometry() {
  const hw = 0.8
  const hh = 0.5
  const r = 0.09
  const nr = 0.07

  const s = new THREE.Shape()
  s.moveTo(-hw + r, -hh)
  s.lineTo(hw - r, -hh)
  s.quadraticCurveTo(hw, -hh, hw, -hh + r)
  s.lineTo(hw, -nr)
  s.absarc(hw, 0, nr, -Math.PI / 2, Math.PI / 2, true)
  s.lineTo(hw, hh - r)
  s.quadraticCurveTo(hw, hh, hw - r, hh)
  s.lineTo(-hw + r, hh)
  s.quadraticCurveTo(-hw, hh, -hw, hh - r)
  s.lineTo(-hw, nr)
  s.absarc(-hw, 0, nr, Math.PI / 2, (3 * Math.PI) / 2, true)
  s.lineTo(-hw, -hh + r)
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh)

  return new THREE.ExtrudeGeometry(s, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 24,
  })
}

function VoucherCard({ spec, geometry }: { spec: CardSpec; geometry: THREE.ExtrudeGeometry }) {
  const ref = useRef<THREE.Mesh>(null)
  const axis = useMemo(() => new THREE.Vector3(...spec.axis).normalize(), [spec.axis])
  const quat = useMemo(() => new THREE.Quaternion(), [])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    quat.setFromAxisAngle(axis, t * spec.speed + spec.phase)
    mesh.quaternion.copy(quat)
    mesh.position.y = spec.pos[1] + Math.sin(t * 0.5 + spec.phase) * 0.18
    mesh.position.x = spec.pos[0] + Math.sin(t * 0.32 + spec.phase * 2) * 0.12
  })

  return (
    <mesh ref={ref} geometry={geometry} position={spec.pos} scale={spec.scale}>
      <meshStandardMaterial color={spec.colour} roughness={0.38} metalness={0.05} />
    </mesh>
  )
}

export function VoucherCards3D() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const inView = useInView(wrapRef, { margin: '200px' })
  const reduceMotion = useReducedMotion()
  const geometry = useMemo(() => makeVoucherGeometry(), [])
  // Narrow viewports pull the drift field toward the centre (the desktop
  // positions sit right of a 5xl column and would land offscreen)
  const [small, setSmall] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const update = () => setSmall(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  const cards = useMemo(
    () => (small ? CARDS.map((c) => ({ ...c, pos: [c.pos[0] * 0.42 - 0.4, c.pos[1], c.pos[2]] as [number, number, number] })) : CARDS),
    [small],
  )

  if (reduceMotion) return null

  return (
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <Canvas
        frameloop={inView ? 'always' : 'never'}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 35, position: [0, 0, 9] }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <ambientLight intensity={0.75} color="#FFF4EC" />
        <directionalLight position={[4, 6, 8]} intensity={1.4} color="#FFFFFF" />
        <directionalLight position={[-6, -3, 2]} intensity={0.5} color="#FF9070" />
        {cards.map((spec, i) => (
          <VoucherCard key={i} spec={spec} geometry={geometry} />
        ))}
      </Canvas>
    </div>
  )
}
