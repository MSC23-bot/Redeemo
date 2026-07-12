'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { useInView } from 'framer-motion'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * The brand ribbon, live in WebGL (owner 2026-07-08: add 3D elements to the
 * hero). One element done properly: the voucher band from the concept sheets
 * as a real-time 3D object, undulating and twisting slowly through the hero
 * space BEHIND the owner's artwork (the collage, veil and floor fade all
 * render above it, so the artwork keeps top billing and gains true depth).
 *
 * The band is a swept rectangular cross-section with duplicated vertices per
 * face so its edges stay crisp (smoothed normals would melt it into a tube).
 * ~220 rings recomputed per frame on the CPU: 1.7k verts, cheap. The canvas
 * only runs while the hero is on screen, and never mounts for reduced-motion
 * visitors (they get the static artwork alone).
 */

const RINGS = 220
const HALF_W = 0.72 // band half-width
const HALF_T = 0.055 // band half-thickness: the visible edge

function RibbonMesh() {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    // 4 side strips, each with its own vertex pair per ring => sharp edges
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
    const time = clock.elapsedTime
    const pos = geometry.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const { c, T, U, V, corner, p0, p1 } = scratch

    const path = (t: number, out: THREE.Vector3) => {
      out.set(
        (t - 0.5) * 36,
        0.5 + 1.9 * Math.sin(t * Math.PI * 2.2 + time * 0.42) + 0.45 * Math.sin(t * Math.PI * 4.6 - time * 0.27),
        -1.3 + 1.5 * Math.sin(t * Math.PI * 1.4 + time * 0.33),
      )
    }

    for (let i = 0; i <= RINGS; i++) {
      const t = i / RINGS
      path(t, c)
      // tangent by central difference
      path(Math.min(1, t + 0.004), p1)
      path(Math.max(0, t - 0.004), p0)
      T.subVectors(p1, p0).normalize()
      // frame: U starts screen-vertical, V faces the camera, then both twist
      U.set(0, 1, 0)
      U.addScaledVector(T, -U.dot(T)).normalize()
      V.crossVectors(T, U).normalize()
      const twist = 1.05 * Math.sin(t * Math.PI * 1.8 + time * 0.5) + 0.35 * Math.sin(time * 0.21)
      const cos = Math.cos(twist)
      const sin = Math.sin(twist)
      // rotate U, V around T
      const ux = U.x * cos + V.x * sin
      const uy = U.y * cos + V.y * sin
      const uz = U.z * cos + V.z * sin
      V.set(V.x * cos - U.x * sin, V.y * cos - U.y * sin, V.z * cos - U.z * sin)
      U.set(ux, uy, uz)

      corner[0].copy(c).addScaledVector(U, HALF_W).addScaledVector(V, HALF_T)
      corner[1].copy(c).addScaledVector(U, -HALF_W).addScaledVector(V, HALF_T)
      corner[2].copy(c).addScaledVector(U, -HALF_W).addScaledVector(V, -HALF_T)
      corner[3].copy(c).addScaledVector(U, HALF_W).addScaledVector(V, -HALF_T)

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
      <meshStandardMaterial color="#DE1004" roughness={0.34} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
  )
}

export function HeroRibbon3D() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const inView = useInView(wrapRef, { margin: '200px' })

  return (
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <Canvas
        frameloop={inView ? 'always' : 'never'}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 35, position: [0, 0, 13] }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <ambientLight intensity={0.85} color="#FFF4EC" />
        <directionalLight position={[4, 6, 8]} intensity={1.5} color="#FFFFFF" />
        <directionalLight position={[-6, -3, -4]} intensity={0.5} color="#FF9070" />
        <RibbonMesh />
      </Canvas>
    </div>
  )
}
