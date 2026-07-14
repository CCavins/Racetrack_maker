import { Suspense, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { Track3D } from '../lib/buildTrack3D'
import { VEHICLE_META, type VehicleId } from '../types'
import { Component, type ReactNode } from 'react'

const VEHICLE_URLS: Record<VehicleId, string> = {
  sports: '/assets/vehicles/sports.glb',
  motorcycle: '/assets/vehicles/motorcycle.glb',
  semi: '/assets/vehicles/semi.glb',
  minivan: '/assets/vehicles/minivan.glb',
}

const AVAILABLE_VEHICLE_GLBS = new Set<VehicleId>([
  'sports',
  'motorcycle',
  'semi',
  'minivan',
])

function FallbackVehicle({ id }: { id: VehicleId }) {
  const color = VEHICLE_META[id].color
  // Bodies are built with length along Z; wrap with π yaw so nose faces
  // local -Z (Three.js lookAt forward).
  const body = (() => {
    if (id === 'motorcycle') {
      return (
        <group>
          <mesh castShadow position={[0, 0.45, 0]}>
            <boxGeometry args={[0.35, 0.35, 1.1]} />
            <meshStandardMaterial color={color} metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh castShadow position={[0, 0.25, 0.35]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.22, 0.06, 8, 16]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          <mesh castShadow position={[0, 0.25, -0.35]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.22, 0.06, 8, 16]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        </group>
      )
    }
    if (id === 'semi') {
      return (
        <group>
          <mesh castShadow position={[0, 0.7, -0.9]}>
            <boxGeometry args={[1.2, 1.1, 1.4]} />
            <meshStandardMaterial color={color} metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh castShadow position={[0, 0.85, 1.2]}>
            <boxGeometry args={[1.3, 1.4, 2.8]} />
            <meshStandardMaterial color="#3a3a3a" metalness={0.2} roughness={0.7} />
          </mesh>
        </group>
      )
    }
    if (id === 'minivan') {
      return (
        <mesh castShadow position={[0, 0.55, 0]}>
          <boxGeometry args={[1.1, 0.85, 2.0]} />
          <meshStandardMaterial color={color} metalness={0.25} roughness={0.55} />
        </mesh>
      )
    }
    return (
      <group>
        <mesh castShadow position={[0, 0.35, 0]}>
          <boxGeometry args={[1.05, 0.35, 2.1]} />
          <meshStandardMaterial color={color} metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh castShadow position={[0, 0.55, 0.15]}>
          <boxGeometry args={[0.9, 0.3, 1.0]} />
          <meshStandardMaterial color="#111" metalness={0.6} roughness={0.2} />
        </mesh>
      </group>
    )
  })()

  return <group rotation={[0, Math.PI, 0]}>{body}</group>
}

function LoadedVehicle({ url, id }: { url: string; id: VehicleId }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => {
    const root = new THREE.Group()
    const c = scene.clone(true)
    c.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })

    // Normalize size
    const box = new THREE.Box3().setFromObject(c)
    const size = new THREE.Vector3()
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const target = id === 'semi' ? 3.2 : id === 'motorcycle' ? 1.6 : 2.2
    c.scale.multiplyScalar(target / maxDim)

    // Recompute bounds after scale
    const box2 = new THREE.Box3().setFromObject(c)
    const size2 = new THREE.Vector3()
    box2.getSize(size2)

    // Higgsfield image-to-3d meshes usually have length along X.
    // Three.js lookAt aims local -Z down the path, so align length to Z.
    if (size2.x > size2.z) {
      c.rotation.y = Math.PI / 2
    }

    root.add(c)
    const box3 = new THREE.Box3().setFromObject(root)
    root.position.y -= box3.min.y
    return root
  }, [scene, id])
  return <primitive object={cloned} />
}

class ErrBoundary extends Component<
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

export type VehicleState = {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  t: number
  lap: number
}

type Props = {
  track: Track3D
  vehicleId: VehicleId
  chaseCam: boolean
  chaseDistance: number
  showBeacon: boolean
  stateRef: MutableRefObject<VehicleState>
  onLap?: (lap: number) => void
}

export function Vehicle({
  track,
  vehicleId,
  chaseCam,
  chaseDistance,
  showBeacon,
  stateRef,
  onLap,
}: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const tRef = useRef(0)
  const lapRef = useRef(0)
  const weaveRef = useRef(0)
  const boostRef = useRef(0)
  const oilSpinRef = useRef(0)
  const oilAngleRef = useRef(0)
  const airYRef = useRef(0)
  const airVelRef = useRef(0)
  const wasAirborne = useRef(false)
  const prevSlopeRef = useRef(0)
  const jumpCooldownRef = useRef(0)
  const avoidLatRef = useRef(0)
  const hitSpinRef = useRef(0)
  const hitLatVelRef = useRef(0)
  const hitSlowRef = useRef(0)
  const hitCooldownRef = useRef(0)
  const shakeRef = useRef(0)

  const baseSpeed = VEHICLE_META[vehicleId].speed
  const carRadius =
    vehicleId === 'semi' ? 1.15 : vehicleId === 'motorcycle' ? 0.45 : 0.75
  const url = AVAILABLE_VEHICLE_GLBS.has(vehicleId)
    ? VEHICLE_URLS[vehicleId]
    : null
  const fallback = <FallbackVehicle id={vehicleId} />

  useFrame((state, delta) => {
    const curve = track.curve
    const len = Math.max(track.length, 1)

    if (boostRef.current > 0) boostRef.current = Math.max(0, boostRef.current - delta)
    if (hitSlowRef.current > 0) hitSlowRef.current = Math.max(0, hitSlowRef.current - delta)
    if (hitCooldownRef.current > 0) hitCooldownRef.current = Math.max(0, hitCooldownRef.current - delta)
    if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - delta)
    hitSpinRef.current *= Math.pow(0.82, delta * 60)
    hitLatVelRef.current *= Math.pow(0.86, delta * 60)

    const tNow = ((tRef.current % 1) + 1) % 1
    const lookAhead = curve.getPointAt(tNow)

    // Decal effects (boost / oil / water) by world proximity
    let onOil = false
    for (const d of track.decals) {
      const dist = lookAhead.distanceTo(d.position)
      const reach = d.kind === 'boost' ? 2.6 : d.kind === 'oil' ? 2.2 : 2.0
      if (dist < reach * d.scale) {
        if (d.kind === 'boost') boostRef.current = Math.max(boostRef.current, 1.4)
        if (d.kind === 'oil') {
          onOil = true
          oilSpinRef.current = Math.max(oilSpinRef.current, 2.1)
        }
        if (d.kind === 'water') {
          weaveRef.current += 0.55 * delta
        }
      }
    }

    // Oil: keep spinning in circles while the spinout lasts
    if (oilSpinRef.current > 0) {
      oilSpinRef.current = Math.max(0, oilSpinRef.current - delta)
      // ~1.15 full rotations per second while sliding
      const spinRate = Math.PI * 2.3 * (0.55 + Math.min(1, oilSpinRef.current))
      oilAngleRef.current += spinRate * delta
      // Keep topping up briefly while still on the slick
      if (onOil) oilSpinRef.current = Math.max(oilSpinRef.current, 1.4)
    } else {
      // Settle facing forward again (shortest way)
      let a = ((oilAngleRef.current + Math.PI) % (Math.PI * 2)) - Math.PI
      if (a < -Math.PI) a += Math.PI * 2
      oilAngleRef.current = THREE.MathUtils.damp(a, 0, 6, delta)
    }

    // Avoidance: steer away from upcoming obstacles
    let avoidTarget = 0
    const lookWindow = 0.08 // ~8% of lap ahead
    for (const obs of track.obstacles) {
      let dt = obs.t - tNow
      if (dt < -0.5) dt += 1
      if (dt > 0.5) dt -= 1
      if (dt < -0.01 || dt > lookWindow) continue

      // Prefer opposite side of obstacle; if on centerline pick a stable side
      const sidePref =
        Math.abs(obs.lateral) < 0.15
          ? obs.position.x * 0.37 + obs.position.z * 0.71 >= 0
            ? 1
            : -1
          : -Math.sign(obs.lateral)

      const urgency = 1 - dt / lookWindow
      const clearance = Math.min(
        ROAD_HALF - 0.35,
        obs.radius + carRadius + 0.55,
      )
      avoidTarget += sidePref * clearance * urgency
    }
    avoidTarget = THREE.MathUtils.clamp(avoidTarget, -ROAD_HALF + 0.2, ROAD_HALF - 0.2)
    avoidLatRef.current = THREE.MathUtils.damp(
      avoidLatRef.current,
      avoidTarget,
      4.5,
      delta,
    )

    const onOilSpin = oilSpinRef.current > 0
    const speedMul =
      (1 + boostRef.current * 0.85) *
      (hitSlowRef.current > 0 ? 0.78 : 1) *
      (onOilSpin ? 0.42 : 1)
    const dt = (baseSpeed * speedMul * delta * 60) / len
    const prevT = tRef.current
    tRef.current = (tRef.current + dt) % 1

    if (tRef.current < prevT) {
      lapRef.current += 1
      onLap?.(lapRef.current)
    }

    const t = tRef.current
    const pos = curve.getPointAt(t)
    const tangent = curve.getTangentAt(t).normalize()
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()

    weaveRef.current *= Math.pow(0.92, delta * 60)
    const weave =
      Math.sin(state.clock.elapsedTime * 6 + weaveRef.current * 8) *
      Math.min(0.9, weaveRef.current * 0.5)

    // Oil slide: sideways drift while the body spins
    const oilSlide = onOilSpin
      ? Math.sin(oilAngleRef.current) * 1.15 +
        Math.cos(oilAngleRef.current * 0.5) * 0.45
      : 0

    const lateral =
      avoidLatRef.current +
      weave +
      hitLatVelRef.current +
      oilSlide

    const clampedLateral = THREE.MathUtils.clamp(
      lateral,
      -ROAD_HALF + 0.15,
      ROAD_HALF - 0.15,
    )

    // jumps — follow the ramp up, loft once off the crest, then land without re-bouncing
    const roadY = pos.y
    const ahead = curve.getPointAt((t + 0.02) % 1)
    const slope = ahead.y - roadY
    const prevSlope = prevSlopeRef.current

    if (jumpCooldownRef.current > 0) {
      jumpCooldownRef.current = Math.max(0, jumpCooldownRef.current - delta)
    }

    if (
      !wasAirborne.current &&
      jumpCooldownRef.current <= 0 &&
      roadY > 0.55 &&
      slope < -0.28 &&
      prevSlope > -0.08
    ) {
      // Crest: road just started dropping after a climb/flat — one loft only
      wasAirborne.current = true
      airYRef.current = roadY
      airVelRef.current = Math.min(2.0, 0.55 + Math.abs(slope) * 1.1)
    }

    let y = roadY
    if (wasAirborne.current) {
      airVelRef.current -= 14 * delta
      airYRef.current += airVelRef.current * delta
      y = Math.max(roadY, airYRef.current)
      if (airYRef.current <= roadY && airVelRef.current <= 0) {
        wasAirborne.current = false
        airYRef.current = 0
        airVelRef.current = 0
        // Lock out until past this bump so the downslope can't fire again
        jumpCooldownRef.current = 0.85
        y = roadY
      }
    }

    prevSlopeRef.current = slope

    const finalPos = pos.clone().addScaledVector(side, clampedLateral)
    finalPos.y = y + 0.05

    // Collision checks in world space
    if (hitCooldownRef.current <= 0) {
      for (const obs of track.obstacles) {
        const dx = finalPos.x - obs.position.x
        const dz = finalPos.z - obs.position.z
        const dist = Math.hypot(dx, dz)
        const hitR = obs.radius + carRadius
        if (dist < hitR) {
          hitCooldownRef.current = 0.85
          hitSlowRef.current = 0.35
          shakeRef.current = 0.22
          // Soft push away from obstacle
          const away =
            dist > 0.001
              ? new THREE.Vector3(dx / dist, 0, dz / dist)
              : side.clone()
          const bounceSide = away.dot(side)
          hitLatVelRef.current +=
            (bounceSide >= 0 ? 1 : -1) * (0.7 + obs.radius * 0.45)
          hitSpinRef.current += (bounceSide >= 0 ? 1 : -1) * 1.4
          // Gentle nudge past the obstacle
          tRef.current = (tRef.current + 0.002) % 1
          break
        }
      }
    }

    const lookTarget = finalPos.clone().add(tangent)
    const dummy = new THREE.Object3D()
    dummy.position.copy(finalPos)
    dummy.lookAt(lookTarget)
    if (wasAirborne.current) dummy.rotateX(-0.2)
    dummy.rotateY(hitSpinRef.current * 0.035 + oilAngleRef.current)
    if (shakeRef.current > 0) {
      dummy.rotateZ(Math.sin(state.clock.elapsedTime * 28) * 0.045 * shakeRef.current)
    }
    if (onOilSpin) {
      // Slight tilt while spinning out
      dummy.rotateZ(Math.sin(oilAngleRef.current) * 0.12)
    }

    if (groupRef.current) {
      groupRef.current.position.copy(finalPos)
      groupRef.current.quaternion.copy(dummy.quaternion)
    }

    stateRef.current = {
      position: finalPos.clone(),
      quaternion: dummy.quaternion.clone(),
      t,
      lap: lapRef.current,
    }

    if (chaseCam) {
      const dist = chaseDistance
      const height = Math.max(2.2, dist * 0.48)
      const camBehind = finalPos
        .clone()
        .addScaledVector(tangent, -dist)
        .add(new THREE.Vector3(0, height, 0))
      state.camera.position.lerp(camBehind, 1 - Math.pow(0.05, delta * 60))
      const look = finalPos
        .clone()
        .addScaledVector(tangent, Math.max(3, dist * 0.45))
      look.y += 0.8
      state.camera.lookAt(look)
    }
  })

  return (
    <group ref={groupRef}>
      {url ? (
        <ErrBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <LoadedVehicle url={url} id={vehicleId} />
          </Suspense>
        </ErrBoundary>
      ) : (
        fallback
      )}
      {showBeacon && <CarBeacon />}
    </group>
  )
}

const ROAD_HALF = 1.7

function CarBeacon() {
  return (
    <group position={[0, 0.2, 0]}>
      <mesh position={[0, 3.2, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 5.5, 6]} />
        <meshStandardMaterial
          color="#e8b923"
          emissive="#e8b923"
          emissiveIntensity={0.9}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh position={[0, 6.2, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.55, 1.1, 3]} />
        <meshStandardMaterial
          color="#e8b923"
          emissive="#ffc933"
          emissiveIntensity={1.2}
        />
      </mesh>
      <mesh position={[0, 6.2, 0]}>
        <ringGeometry args={[0.7, 1.05, 24]} />
        <meshBasicMaterial
          color="#e8b923"
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
