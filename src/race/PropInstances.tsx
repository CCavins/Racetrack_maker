import { Component, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { ROAD_WIDTH, type PropPlacement, type DecalPlacement } from '../lib/buildTrack3D'
import type { StickerType } from '../types'

const PROP_URLS: Partial<Record<StickerType, string>> = {
  cone: `${import.meta.env.BASE_URL}assets/props/cone.glb`,
  barrier: `${import.meta.env.BASE_URL}assets/props/barrier.glb`,
  rock: `${import.meta.env.BASE_URL}assets/props/rock.glb`,
  tree: `${import.meta.env.BASE_URL}assets/props/tree.glb`,
  tires: `${import.meta.env.BASE_URL}assets/props/tires.glb`,
  billboard: `${import.meta.env.BASE_URL}assets/props/billboard.glb`,
}

/** Only attempt GLB load for assets we know shipped with the build */
const AVAILABLE_PROP_GLBS = new Set<StickerType>([
  'cone',
  'barrier',
  'rock',
  'tree',
  'tires',
  'billboard',
])

function FallbackProp({ type, scale }: { type: StickerType; scale: number }) {
  const s = scale
  switch (type) {
    case 'cone':
      return (
        <mesh castShadow position={[0, 0.4 * s, 0]}>
          <coneGeometry args={[0.25 * s, 0.8 * s, 8]} />
          <meshStandardMaterial color="#f07316" roughness={0.7} />
        </mesh>
      )
    case 'barrier':
      return (
        <mesh castShadow position={[0, 0.35 * s, 0]}>
          <boxGeometry args={[1.4 * s, 0.7 * s, 0.25 * s]} />
          <meshStandardMaterial color="#e8b923" roughness={0.6} />
        </mesh>
      )
    case 'rock':
      return (
        <mesh castShadow position={[0, 0.35 * s, 0]} scale={[1.1, 0.8, 1]}>
          <dodecahedronGeometry args={[0.5 * s, 0]} />
          <meshStandardMaterial color="#6b6b6b" roughness={0.95} />
        </mesh>
      )
    case 'tree':
      return (
        <group>
          <mesh castShadow position={[0, 0.4 * s, 0]}>
            <cylinderGeometry args={[0.1 * s, 0.14 * s, 0.8 * s, 6]} />
            <meshStandardMaterial color="#5c3a21" />
          </mesh>
          <mesh castShadow position={[0, 1.1 * s, 0]}>
            <coneGeometry args={[0.55 * s, 1.2 * s, 7]} />
            <meshStandardMaterial color="#2d6a3e" />
          </mesh>
        </group>
      )
    case 'tires':
      return (
        <group>
          {[0, 0.35, 0.7].map((y, i) => (
            <mesh
              key={i}
              castShadow
              position={[0, y * s, 0]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <torusGeometry args={[0.28 * s, 0.1 * s, 8, 16]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
          ))}
        </group>
      )
    case 'billboard':
      return (
        <group>
          <mesh castShadow position={[0, 0.6 * s, 0]}>
            <cylinderGeometry args={[0.06 * s, 0.06 * s, 1.2 * s, 6]} />
            <meshStandardMaterial color="#444" />
          </mesh>
          <mesh castShadow position={[0, 1.4 * s, 0]}>
            <boxGeometry args={[1.6 * s, 0.9 * s, 0.08 * s]} />
            <meshStandardMaterial color="#e84d4d" />
          </mesh>
        </group>
      )
    default:
      return (
        <mesh castShadow position={[0, 0.3 * s, 0]}>
          <boxGeometry args={[0.5 * s, 0.5 * s, 0.5 * s]} />
          <meshStandardMaterial color="#888" />
        </mesh>
      )
  }
}

function LoadedGlb({ url, scale }: { url: string; scale: number }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
    const box = new THREE.Box3().setFromObject(c)
    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    c.scale.multiplyScalar(1.4 / maxDim)
    const box2 = new THREE.Box3().setFromObject(c)
    c.position.y -= box2.min.y
    return c
  }, [scene])
  return <primitive object={cloned} scale={scale} />
}

class GlbErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { error: boolean }
> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  render() {
    if (this.state.error) return this.props.fallback
    return this.props.children
  }
}

function PropItem({ prop }: { prop: PropPlacement }) {
  const url =
    AVAILABLE_PROP_GLBS.has(prop.type) ? PROP_URLS[prop.type] : undefined
  const fallback = <FallbackProp type={prop.type} scale={prop.scale} />

  return (
    <group
      position={[prop.position.x, prop.position.y, prop.position.z]}
      rotation={[0, prop.rotation, 0]}
    >
      {url ? (
        <GlbErrorBoundary fallback={fallback}>
          <LoadedGlb url={url} scale={prop.scale} />
        </GlbErrorBoundary>
      ) : (
        fallback
      )}
    </group>
  )
}

/** Forward-pointing boost V (chevron) in shape XY → ground after −π/2 X rot */
function boostVShape(width: number, thickness = 0.28) {
  const s = new THREE.Shape()
  const w = width * 0.5
  const tip = -w * 0.72
  const back = w * 0.38
  const t = thickness
  // Outer V outline filled as a thick chevron (tip along travel direction)
  s.moveTo(0, tip)
  s.lineTo(w, back)
  s.lineTo(w - t * w * 0.55, back)
  s.lineTo(0, tip + t * Math.abs(tip) * 1.15)
  s.lineTo(-w + t * w * 0.55, back)
  s.lineTo(-w, back)
  s.closePath()
  return s
}

/** Soft filled glow behind the V */
function boostGlowShape(width: number) {
  const s = new THREE.Shape()
  const w = width * 0.55
  s.moveTo(0, -w * 0.85)
  s.lineTo(w, w * 0.45)
  s.lineTo(0, w * 0.15)
  s.lineTo(-w, w * 0.45)
  s.closePath()
  return s
}

/** Organic puddle / slick outline */
function puddleShape(rx: number, rz: number, seed: number, lobes = 5) {
  const s = new THREE.Shape()
  const n = 28
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const wobble =
      0.72 +
      0.18 * Math.sin(a * lobes + seed) +
      0.1 * Math.cos(a * (lobes + 2) - seed * 1.3) +
      0.06 * Math.sin(a * 2 + seed * 0.5)
    const x = Math.cos(a) * rx * wobble
    const y = Math.sin(a) * rz * wobble
    if (i === 0) s.moveTo(x, y)
    else s.lineTo(x, y)
  }
  s.closePath()
  return s
}

function BoostDecal({
  decal,
  roadWidth,
}: {
  decal: DecalPlacement
  roadWidth: number
}) {
  const glowMat = useRef<THREE.MeshStandardMaterial>(null)
  const vMat = useRef<THREE.MeshStandardMaterial>(null)
  const scale = decal.scale
  const w = roadWidth * 0.72 * scale

  useFrame((state) => {
    const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 4.2) * 0.35
    if (glowMat.current) glowMat.current.emissiveIntensity = 1.1 * pulse
    if (vMat.current) vMat.current.emissiveIntensity = 2.2 * pulse
  })

  return (
    <group
      position={[decal.position.x, decal.position.y, decal.position.z]}
      rotation={[0, decal.rotation, 0]}
    >
      {/* Soft cyan wash under the Vs — not a solid pad */}
      {[-0.95, 0.15, 1.25].map((z, i) => (
        <mesh
          key={`g-${i}`}
          position={[0, 0.06, z * scale]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <shapeGeometry args={[boostGlowShape(w * (1 - i * 0.06))]} />
          <meshStandardMaterial
            ref={i === 1 ? glowMat : undefined}
            color="#1a6fd4"
            emissive="#3db8ff"
            emissiveIntensity={1.1}
            transparent
            opacity={0.28}
            depthWrite={false}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      ))}
      {/* Glowing V chevrons */}
      {[-0.95, 0.15, 1.25].map((z, i) => (
        <mesh
          key={`v-${i}`}
          position={[0, 0.09, z * scale]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <shapeGeometry args={[boostVShape(w * (0.92 - i * 0.04), 0.32)]} />
          <meshStandardMaterial
            ref={i === 1 ? vMat : undefined}
            color="#f0fbff"
            emissive="#6ed4ff"
            emissiveIntensity={2.2}
            roughness={0.25}
            metalness={0.15}
            transparent
            opacity={0.95}
            depthWrite={false}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-3}
          />
        </mesh>
      ))}
      <pointLight
        color="#4ec8ff"
        intensity={1.8 * scale}
        distance={6 * scale}
        position={[0, 0.4, 0.2]}
      />
    </group>
  )
}

function WaterDecal({ decal }: { decal: DecalPlacement }) {
  const s = decal.scale
  const rx = 1.55 * s
  const rz = 1.15 * s
  const main = useMemo(() => puddleShape(rx, rz, 1.2, 4), [rx, rz])
  const inner = useMemo(() => puddleShape(rx * 0.55, rz * 0.5, 2.1, 5), [rx, rz])
  const drop = useMemo(() => puddleShape(rx * 0.28, rz * 0.22, 4.4, 3), [rx, rz])

  return (
    <group
      position={[decal.position.x, decal.position.y, decal.position.z]}
      rotation={[0, decal.rotation, 0]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <shapeGeometry args={[main]} />
        <meshStandardMaterial
          color="#3a9fd8"
          emissive="#2a88c0"
          emissiveIntensity={0.4}
          transparent
          opacity={0.58}
          roughness={0.15}
          metalness={0.25}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      {/* Highlight / ripple core */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.08 * s, 0.07, -0.05 * s]}>
        <shapeGeometry args={[inner]} />
        <meshStandardMaterial
          color="#b8e8ff"
          emissive="#7ecfff"
          emissiveIntensity={0.55}
          transparent
          opacity={0.4}
          roughness={0.08}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-3}
        />
      </mesh>
      {/* Satellite droplet */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[rx * 0.72, 0.055, rz * 0.55]}
      >
        <shapeGeometry args={[drop]} />
        <meshStandardMaterial
          color="#4aaee0"
          emissive="#3a9fd8"
          emissiveIntensity={0.3}
          transparent
          opacity={0.5}
          roughness={0.12}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
    </group>
  )
}

function OilDecal({ decal }: { decal: DecalPlacement }) {
  const s = decal.scale
  const rx = 1.65 * s
  const rz = 1.2 * s
  const main = useMemo(() => puddleShape(rx, rz, 0.7, 6), [rx, rz])
  const sheen = useMemo(() => puddleShape(rx * 0.62, rz * 0.48, 3.3, 4), [rx, rz])
  const sheen2 = useMemo(() => puddleShape(rx * 0.35, rz * 0.22, 8.2, 3), [rx, rz])
  const drop = useMemo(() => puddleShape(rx * 0.26, rz * 0.2, 5.1, 3), [rx, rz])

  return (
    <group
      position={[decal.position.x, decal.position.y, decal.position.z]}
      rotation={[0, decal.rotation, 0]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <shapeGeometry args={[main]} />
        <meshStandardMaterial
          color="#0a0a12"
          emissive="#1a0a28"
          emissiveIntensity={0.35}
          transparent
          opacity={0.88}
          roughness={0.18}
          metalness={0.92}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      {/* Iridescent rainbow sheen */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.1 * s, 0.07, 0.05 * s]}>
        <shapeGeometry args={[sheen]} />
        <meshStandardMaterial
          color="#2a1840"
          emissive="#3d9a8a"
          emissiveIntensity={0.7}
          transparent
          opacity={0.45}
          roughness={0.1}
          metalness={0.95}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-3}
        />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[rx * 0.15, 0.075, -rz * 0.12]}
      >
        <shapeGeometry args={[sheen2]} />
        <meshStandardMaterial
          color="#1a1028"
          emissive="#8a3a9a"
          emissiveIntensity={0.55}
          transparent
          opacity={0.35}
          roughness={0.08}
          metalness={1}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-4}
        />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[rx * 0.78, 0.055, rz * 0.48]}
      >
        <shapeGeometry args={[drop]} />
        <meshStandardMaterial
          color="#0c0c14"
          emissive="#2a6a78"
          emissiveIntensity={0.4}
          transparent
          opacity={0.85}
          roughness={0.15}
          metalness={0.9}
          depthWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
    </group>
  )
}

function DecalItem({
  decal,
  roadWidth,
}: {
  decal: DecalPlacement
  roadWidth: number
}) {
  if (decal.kind === 'boost') {
    return <BoostDecal decal={decal} roadWidth={roadWidth} />
  }
  if (decal.kind === 'water') return <WaterDecal decal={decal} />
  return <OilDecal decal={decal} />
}

export function PropInstances({
  props,
  decals,
  roadWidth = ROAD_WIDTH,
}: {
  props: PropPlacement[]
  decals: DecalPlacement[]
  roadWidth?: number
}) {
  return (
    <group>
      {props.map((p, i) => (
        <PropItem key={`p-${i}`} prop={p} />
      ))}
      {decals.map((d, i) => (
        <DecalItem key={`d-${i}`} decal={d} roadWidth={roadWidth} />
      ))}
    </group>
  )
}
