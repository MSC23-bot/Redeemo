'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useInView, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

/**
 * The merchant's own product in 3D (owner 2026-07-13: for-businesses gets
 * its own WebGL, NOT the ribbon): die-cut voucher cards, the thing a
 * business designs on Redeemo, drifting through the hero. Each card face
 * carries a real offer a business would run (owner: empty cards did not
 * resonate): drawn onto canvas textures in the brand palette. Cards swing
 * rather than spin, so the printed face stays readable.
 *
 * Same guards as RibbonScene3D: client-only mount, reduced-motion returns
 * null, render loop stops offscreen, dpr capped.
 */

type CardSpec = {
  pos: [number, number, number]
  scale: number
  speed: number
  phase: number
  axis: [number, number, number]
  bg: string
  ink: string
  kicker: string
  value: string
  sub: string
}

const CARDS: CardSpec[] = [
  { pos: [3.3, 0.5, -0.9], scale: 0.95, speed: 0.5, phase: 0.0, axis: [0.25, 1, 0.1], bg: '#E20C04', ink: '#FFFFFF', kicker: 'MEMBER VOUCHER', value: '2 FOR 1', sub: 'Mains · Mon to Thu' },
  { pos: [4.8, -0.9, -1.8], scale: 0.8, speed: 0.42, phase: 1.7, axis: [0.5, 0.8, 0.2], bg: '#E8500A', ink: '#FFFFFF', kicker: 'MEMBER VOUCHER', value: '20% OFF', sub: 'Off-peak classes' },
  { pos: [2.2, -1.5, -2.6], scale: 0.65, speed: 0.36, phase: 3.1, axis: [0.15, 1, 0.4], bg: '#FFF9F5', ink: '#010C35', kicker: 'MEMBER VOUCHER', value: 'FREE COFFEE', sub: 'With any breakfast' },
  { pos: [4.9, 1.7, -3.2], scale: 0.75, speed: 0.45, phase: 4.4, axis: [0.3, 0.9, 0.1], bg: '#9E0802', ink: '#FFFFFF', kicker: 'MEMBER VOUCHER', value: '£10 OFF', sub: 'First visit' },
  { pos: [1.4, 1.7, -3.6], scale: 0.55, speed: 0.4, phase: 5.6, axis: [0.4, 0.7, 0.3], bg: '#E8500A', ink: '#FFFFFF', kicker: 'MEMBER VOUCHER', value: 'BUY 1 GET 1', sub: 'Desserts, all week' },
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

// A voucher face, drawn: kicker, the offer, its terms, and a tear line.
// Fonts fall back gracefully if Lato has not finished loading.
function makeFaceTexture(spec: CardSpec): THREE.CanvasTexture {
  const W = 512
  const H = 320
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = spec.bg
  ctx.fillRect(0, 0, W, H)

  const faded = spec.ink === '#FFFFFF' ? 'rgba(255,255,255,0.62)' : 'rgba(1,12,53,0.55)'
  const dash = spec.ink === '#FFFFFF' ? 'rgba(255,255,255,0.4)' : 'rgba(1,12,53,0.28)'

  ctx.fillStyle = faded
  ctx.font = '700 21px Lato, sans-serif'
  ctx.textBaseline = 'alphabetic'
  // letter-spaced kicker
  let x = 44
  for (const ch of spec.kicker) {
    ctx.fillText(ch, x, 74)
    x += ctx.measureText(ch).width + 3.4
  }

  ctx.fillStyle = spec.ink
  ctx.font = '800 64px Lato, sans-serif'
  ctx.fillText(spec.value, 42, 158)

  ctx.fillStyle = faded
  ctx.font = '600 26px Lato, sans-serif'
  ctx.fillText(spec.sub, 44, 202)

  ctx.strokeStyle = dash
  ctx.lineWidth = 3
  ctx.setLineDash([12, 9])
  ctx.beginPath()
  ctx.moveTo(28, 246)
  ctx.lineTo(W - 28, 246)
  ctx.stroke()

  ctx.setLineDash([])
  ctx.fillStyle = faded
  ctx.font = '700 20px Lato, sans-serif'
  ctx.fillText('Redeem with Redeemo', 44, 288)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  // Front-face UVs of an ExtrudeGeometry are the raw shape coordinates
  // (x in [-0.8, 0.8], y in [-0.5, 0.5]): map them onto [0, 1]
  tex.repeat.set(1 / 1.6, 1 / 1.0)
  tex.offset.set(0.5, 0.5)
  return tex
}

function VoucherCard({ spec, geometry }: { spec: CardSpec; geometry: THREE.ExtrudeGeometry }) {
  const ref = useRef<THREE.Mesh>(null)
  const axis = useMemo(() => new THREE.Vector3(...spec.axis).normalize(), [spec.axis])
  const quat = useMemo(() => new THREE.Quaternion(), [])
  const materials = useMemo(() => {
    const face = new THREE.MeshStandardMaterial({ map: makeFaceTexture(spec), roughness: 0.42, metalness: 0.04 })
    const edge = new THREE.MeshStandardMaterial({ color: spec.bg, roughness: 0.5, metalness: 0.04 })
    return [face, edge]
  }, [spec])
  useEffect(() => () => {
    materials.forEach((m) => {
      m.map?.dispose()
      m.dispose()
    })
  }, [materials])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const t = clock.elapsedTime
    // A swing, not a spin: the offer stays readable while the card floats
    quat.setFromAxisAngle(axis, Math.sin(t * spec.speed + spec.phase) * 0.42)
    mesh.quaternion.copy(quat)
    mesh.position.y = spec.pos[1] + Math.sin(t * 0.5 + spec.phase) * 0.18
    mesh.position.x = spec.pos[0] + Math.sin(t * 0.32 + spec.phase * 2) * 0.12
  })

  return <mesh ref={ref} geometry={geometry} material={materials} position={spec.pos} scale={spec.scale} />
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
        <ambientLight intensity={0.8} color="#FFF4EC" />
        <directionalLight position={[4, 6, 8]} intensity={1.35} color="#FFFFFF" />
        <directionalLight position={[-6, -3, 2]} intensity={0.45} color="#FF9070" />
        {cards.map((spec, i) => (
          <VoucherCard key={i} spec={spec} geometry={geometry} />
        ))}
      </Canvas>
    </div>
  )
}
