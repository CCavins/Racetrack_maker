import {
  Component,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { Track3D } from '../lib/buildTrack3D'
import { VEHICLE_META, type VehicleId, type VehicleLookMode } from '../types'
import { recolorBodyMaterials } from '../lib/vehicleStyle'

const VEHICLE_URLS: Record<VehicleId, string> = {
  motorcycle: `${import.meta.env.BASE_URL}assets/vehicles/motorcycle.glb`,
  truck: `${import.meta.env.BASE_URL}assets/vehicles/truck.glb`,
  van: `${import.meta.env.BASE_URL}assets/vehicles/van.glb`,
  race: `${import.meta.env.BASE_URL}assets/vehicles/race.glb`,
  sedan: `${import.meta.env.BASE_URL}assets/vehicles/sedan.glb`,
  taxi: `${import.meta.env.BASE_URL}assets/vehicles/taxi.glb`,
  police: `${import.meta.env.BASE_URL}assets/vehicles/police.glb`,
  suv: `${import.meta.env.BASE_URL}assets/vehicles/suv.glb`,
  ambulance: `${import.meta.env.BASE_URL}assets/vehicles/ambulance.glb`,
  hatchback: `${import.meta.env.BASE_URL}assets/vehicles/hatchback.glb`,
  future: `${import.meta.env.BASE_URL}assets/vehicles/future.glb`,
  hovercar: `${import.meta.env.BASE_URL}assets/vehicles/hovercar.glb`,
  cruiser: `${import.meta.env.BASE_URL}assets/vehicles/cruiser.glb`,
  muscle: `${import.meta.env.BASE_URL}assets/vehicles/muscle.glb`,
}

const AVAILABLE_VEHICLE_GLBS = new Set<VehicleId>([
  'motorcycle',
  'truck',
  'van',
  'race',
  'sedan',
  'taxi',
  'police',
  'suv',
  'ambulance',
  'hatchback',
  'future',
  'hovercar',
  'cruiser',
  'muscle',
])

function FallbackVehicle({
  id,
  color,
  wrapMap,
  look,
}: {
  id: VehicleId
  color: string
  wrapMap: THREE.Texture | null
  look: VehicleLookMode
}) {
  const stockColor = VEHICLE_META[id].color
  const bodyColor = look === 'paint' ? color : stockColor
  const useWrap = look === 'wrap' && wrapMap
  const bodyMat = (
    <meshStandardMaterial
      color={useWrap ? '#ffffff' : bodyColor}
      map={useWrap ? wrapMap : undefined}
      metalness={0.4}
      roughness={0.4}
    />
  )
  // Bodies are built with length along Z; wrap with π yaw so nose faces
  // local -Z (Three.js lookAt forward).
  const body = (() => {
    if (id === 'motorcycle') {
      return (
        <group>
          <mesh castShadow position={[0, 0.45, 0]}>
            <boxGeometry args={[0.35, 0.35, 1.1]} />
            {bodyMat}
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
    if (id === 'truck') {
      return (
        <group>
          <mesh castShadow position={[0, 0.55, -0.35]}>
            <boxGeometry args={[1.15, 0.7, 1.3]} />
            {bodyMat}
          </mesh>
          <mesh castShadow position={[0, 0.4, 0.85]}>
            <boxGeometry args={[1.1, 0.35, 1.2]} />
            {bodyMat}
          </mesh>
        </group>
      )
    }
    if (id === 'van') {
      return (
        <mesh castShadow position={[0, 0.55, 0]}>
          <boxGeometry args={[1.1, 0.95, 2.0]} />
          {bodyMat}
        </mesh>
      )
    }
    return (
      <group>
        <mesh castShadow position={[0, 0.35, 0]}>
          <boxGeometry args={[1.05, 0.35, 2.1]} />
          {bodyMat}
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

function LoadedVehicle({
  url,
  id,
  color,
  wrapMap,
  look,
}: {
  url: string
  id: VehicleId
  color: string
  wrapMap: THREE.Texture | null
  look: VehicleLookMode
}) {
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
    const target =
      id === 'truck' || id === 'ambulance'
        ? 3.0
        : id === 'suv' || id === 'van'
          ? 2.6
          : id === 'motorcycle'
            ? 1.6
            : 2.2
    c.scale.multiplyScalar(target / maxDim)

    // Recompute bounds after scale
    const box2 = new THREE.Box3().setFromObject(c)
    const size2 = new THREE.Vector3()
    box2.getSize(size2)

    // Higgsfield / Kenney: length often along X. lookAt aims local -Z down the path.
    if (size2.x > size2.z) {
      c.rotation.y = Math.PI / 2
    }
    // Some Sketchfab exports face the opposite way after axis align
    const facingFlip: Partial<Record<VehicleId, number>> = {
      muscle: Math.PI,
      cruiser: Math.PI,
    }
    c.rotation.y += facingFlip[id] ?? 0

    root.add(c)
    const box3 = new THREE.Box3().setFromObject(root)
    root.position.y -= box3.min.y

    if (look === 'paint') {
      recolorBodyMaterials(root, color, null)
    } else if (look === 'wrap' && wrapMap) {
      recolorBodyMaterials(root, color, wrapMap)
    }
    // stock: leave GLB materials as-is
    return root
  }, [scene, id, color, wrapMap, look])
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
  lateral: number
  vehicleId: VehicleId
}

/** Shared snapshot so racers can steer around each other */
export type PeerSnapshot = {
  t: number
  lap: number
  lateral: number
  radius: number
  active: boolean
}

type Props = {
  track: Track3D
  vehicleId: VehicleId
  vehicleLook: VehicleLookMode
  vehicleColor: string
  vehicleWrap: string | null
  reverseDirection: boolean
  chaseCam: boolean
  chaseDistance: number
  chaseOrbit: number
  showBeacon: boolean
  /** When false, hold still until assets / scene are ready */
  running?: boolean
  stateRef: MutableRefObject<VehicleState>
  /** Index into peersRef for this racer */
  racerIndex?: number
  peersRef?: MutableRefObject<PeerSnapshot[]>
  /** Starting progress along the lap (stagger grid) */
  startT?: number
  /** Starting lateral lane offset */
  startLateral?: number
  onLap?: (lap: number, vehicleId: VehicleId) => void
}

export function Vehicle({
  track,
  vehicleId,
  vehicleLook,
  vehicleColor,
  vehicleWrap,
  reverseDirection,
  chaseCam,
  chaseDistance,
  chaseOrbit,
  showBeacon,
  running = true,
  stateRef,
  racerIndex = 0,
  peersRef,
  startT = 0,
  startLateral = 0,
  onLap,
}: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const tRef = useRef(startT)
  const lapRef = useRef(0)
  const weaveRef = useRef(0)
  const boostRef = useRef(0)
  /** Motorcycle wheelie timeline (seconds elapsed); <0 = inactive */
  const wheelieTRef = useRef(-1)
  const wheelieAngleRef = useRef(0)
  const oilSpinRef = useRef(0)
  const oilAngleRef = useRef(0)
  const waterLatRef = useRef(0)
  const waterVelRef = useRef(0)
  const waterYawRef = useRef(0)
  const waterYawTargetRef = useRef(0)
  const waterTimerRef = useRef(0)
  const waterCooldownRef = useRef(0)
  const airYRef = useRef(0)
  const airVelRef = useRef(0)
  const wasAirborne = useRef(false)
  const prevSlopeRef = useRef(0)
  const jumpCooldownRef = useRef(0)
  const avoidLatRef = useRef(startLateral)
  const peerSlowRef = useRef(0)
  const hitSpinRef = useRef(0)
  const hitLatVelRef = useRef(0)
  const hitSlowRef = useRef(0)
  const hitCooldownRef = useRef(0)
  const shakeRef = useRef(0)
  const smoothTanRef = useRef(new THREE.Vector3(0, 0, 1))
  const smoothPosRef = useRef(new THREE.Vector3())
  const smoothQuatRef = useRef(new THREE.Quaternion())
  const smoothPitchRef = useRef(0)
  const motionReadyRef = useRef(false)
  const lateralOutRef = useRef(startLateral)

  const wrapMap = useMemo(() => {
    if (vehicleLook !== 'wrap' || !vehicleWrap) return null
    const loader = new THREE.TextureLoader()
    const tex = loader.load(vehicleWrap)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.flipY = true
    tex.needsUpdate = true
    return tex
  }, [vehicleWrap, vehicleLook])

  const baseSpeed = VEHICLE_META[vehicleId].speed
  const carRadius =
    vehicleId === 'truck' || vehicleId === 'ambulance'
      ? 1.1
      : vehicleId === 'suv' || vehicleId === 'van'
        ? 0.95
        : vehicleId === 'motorcycle'
          ? 0.45
          : 0.75
  const url = AVAILABLE_VEHICLE_GLBS.has(vehicleId)
    ? VEHICLE_URLS[vehicleId]
    : null
  const fallback = (
    <FallbackVehicle
      id={vehicleId}
      color={vehicleColor}
      wrapMap={wrapMap}
      look={vehicleLook}
    />
  )

  useFrame((state, rawDelta) => {
    if (!running) return
    const delta = Math.min(rawDelta, 1 / 28)
    const curve = track.curve
    const len = Math.max(track.length, 1)

    if (boostRef.current > 0) boostRef.current = Math.max(0, boostRef.current - delta)
    if (hitSlowRef.current > 0) hitSlowRef.current = Math.max(0, hitSlowRef.current - delta)
    if (hitCooldownRef.current > 0) hitCooldownRef.current = Math.max(0, hitCooldownRef.current - delta)
    if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - delta)
    if (waterCooldownRef.current > 0) {
      waterCooldownRef.current = Math.max(0, waterCooldownRef.current - delta)
    }
    hitSpinRef.current *= Math.pow(0.82, delta * 60)
    hitLatVelRef.current *= Math.pow(0.86, delta * 60)

    const tNow = ((tRef.current % 1) + 1) % 1
    const lookAhead = curve.getPointAt(tNow)

    // Decal effects (boost / oil / water) by world proximity
    let onOil = false
    let onWater = false
    for (const d of track.decals) {
      const dist = lookAhead.distanceTo(d.position)
      const reach = d.kind === 'boost' ? 2.6 : d.kind === 'oil' ? 2.2 : 2.0
      if (dist < reach * d.scale) {
        if (d.kind === 'boost') {
          // Fresh boost pad hit → motorcycle pops a wheelie
          if (
            vehicleId === 'motorcycle' &&
            boostRef.current < 0.2 &&
            wheelieTRef.current < 0
          ) {
            wheelieTRef.current = 0
          }
          boostRef.current = Math.max(boostRef.current, 1.4)
        }
        if (d.kind === 'oil') {
          onOil = true
          oilSpinRef.current = Math.max(oilSpinRef.current, 1.45)
        }
        if (d.kind === 'water') {
          onWater = true
        }
      }
    }

    // Motorcycle-only wheelie: 2s, nose up 30°, rear stays planted
    const WHEELIE_DUR = 2
    const WHEELIE_MAX = Math.PI / 6 // 30°
    let wheelieAngle = 0
    if (vehicleId === 'motorcycle' && wheelieTRef.current >= 0) {
      wheelieTRef.current += delta
      const u = Math.min(1, wheelieTRef.current / WHEELIE_DUR)
      // Rise with the boost (~0.45s), hold, then settle (~0.55s)
      const riseEnd = 0.22
      const fallStart = 0.68
      let env = 1
      if (u < riseEnd) {
        const t = u / riseEnd
        env = t * t * (3 - 2 * t)
      } else if (u > fallStart) {
        const t = (u - fallStart) / (1 - fallStart)
        const s = t * t * (3 - 2 * t)
        env = 1 - s
      }
      wheelieAngle = WHEELIE_MAX * env
      if (wheelieTRef.current >= WHEELIE_DUR) {
        wheelieTRef.current = -1
        wheelieAngle = 0
      }
    } else if (vehicleId !== 'motorcycle') {
      wheelieTRef.current = -1
    }
    wheelieAngleRef.current = THREE.MathUtils.damp(
      wheelieAngleRef.current,
      wheelieAngle,
      14,
      delta,
    )
    const wheelie = wheelieAngleRef.current

    // Water: sideways slide + small skid angle (not oil-style full rotations)
    if (onWater && waterCooldownRef.current <= 0) {
      const side =
        Math.abs(waterLatRef.current) > 0.08
          ? Math.sign(waterLatRef.current)
          : Math.random() < 0.5
            ? -1
            : 1
      waterVelRef.current = side * (2.2 + Math.random() * 1.0)
      // ~18–32° yaw into the slide — readable, never a spin
      waterYawTargetRef.current = side * (0.32 + Math.random() * 0.24)
      waterTimerRef.current = Math.max(
        waterTimerRef.current,
        0.95 + Math.random() * 0.4,
      )
      waterCooldownRef.current = 1.4
    } else if (onWater && waterTimerRef.current > 0) {
      waterTimerRef.current = Math.max(waterTimerRef.current, 0.3)
    }

    if (waterTimerRef.current > 0) {
      waterTimerRef.current = Math.max(0, waterTimerRef.current - delta)
      waterLatRef.current += waterVelRef.current * delta
      waterVelRef.current *= Math.pow(0.9, delta * 60)
      waterYawRef.current = THREE.MathUtils.damp(
        waterYawRef.current,
        waterYawTargetRef.current,
        7,
        delta,
      )
      const maxSlide = ROAD_HALF - 0.35
      if (Math.abs(waterLatRef.current) > maxSlide) {
        waterLatRef.current = Math.sign(waterLatRef.current) * maxSlide
        waterVelRef.current *= 0.3
      }
    } else {
      waterYawTargetRef.current = 0
      waterLatRef.current = THREE.MathUtils.damp(waterLatRef.current, 0, 3.2, delta)
      waterVelRef.current = THREE.MathUtils.damp(waterVelRef.current, 0, 5, delta)
      waterYawRef.current = THREE.MathUtils.damp(waterYawRef.current, 0, 4.5, delta)
    }

    // Oil: keep spinning in circles while the spinout lasts
    if (oilSpinRef.current > 0) {
      oilSpinRef.current = Math.max(0, oilSpinRef.current - delta)
      // ~0.9 full rotations per second — about one fewer spin than before
      const spinRate = Math.PI * 1.7 * (0.5 + Math.min(1, oilSpinRef.current))
      oilAngleRef.current += spinRate * delta
      // Keep topping up briefly while still on the slick
      if (onOil) oilSpinRef.current = Math.max(oilSpinRef.current, 0.85)
    } else {
      // Settle facing forward again (shortest way)
      let a = ((oilAngleRef.current + Math.PI) % (Math.PI * 2)) - Math.PI
      if (a < -Math.PI) a += Math.PI * 2
      oilAngleRef.current = THREE.MathUtils.damp(a, 0, 6, delta)
    }

    // Avoidance: steer away from upcoming obstacles + peer racers
    let avoidTarget = startLateral
    const lookWindow = 0.08 // ~8% of lap ahead
    for (const obs of track.obstacles) {
      let dt = obs.t - tNow
      if (dt < -0.5) dt += 1
      if (dt > 0.5) dt -= 1
      if (reverseDirection) dt = -dt
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
      avoidTarget += sidePref * clearance * urgency * 0.85
    }

    // Smooth peer separation — ease aside, lightly lift off the throttle
    let peerSlow = 0
    const peers = peersRef?.current
    if (peers) {
      const myLat = lateralOutRef.current
      for (let i = 0; i < peers.length; i++) {
        if (i === racerIndex) continue
        const peer = peers[i]
        if (!peer?.active) continue

        // Progress delta in travel direction (ahead = positive)
        let dProg =
          peer.lap - lapRef.current + (peer.t - tNow)
        if (reverseDirection) dProg = -dProg
        // Wrap short gaps across the start/finish
        if (dProg > 0.5) dProg -= 1
        if (dProg < -0.5) dProg += 1

        const latGap = peer.lateral - myLat
        const absLat = Math.abs(latGap)
        const needSep = carRadius + peer.radius + 0.55

        // Peer ahead in our lane → ease off and drift aside
        if (dProg > 0.002 && dProg < 0.07) {
          const along = 1 - dProg / 0.07
          if (absLat < needSep) {
            const side =
              absLat < 0.08
                ? racerIndex % 2 === 0
                  ? 1
                  : -1
                : -Math.sign(latGap || 1)
            const push = (needSep - absLat) * along * 1.15
            avoidTarget += side * push
            peerSlow = Math.max(peerSlow, along * 0.28)
          }
        }

        // Peer beside / slightly behind overlapping lane → gentle spread
        if (Math.abs(dProg) < 0.035 && absLat < needSep) {
          const side =
            absLat < 0.06
              ? racerIndex % 2 === 0
                ? 1
                : -1
              : -Math.sign(latGap || 1)
          const overlap = (needSep - absLat) / needSep
          avoidTarget += side * overlap * 0.7
        }
      }
    }
    peerSlowRef.current = THREE.MathUtils.damp(
      peerSlowRef.current,
      peerSlow,
      4,
      delta,
    )

    avoidTarget = THREE.MathUtils.clamp(avoidTarget, -ROAD_HALF + 0.25, ROAD_HALF - 0.25)
    avoidLatRef.current = THREE.MathUtils.damp(
      avoidLatRef.current,
      avoidTarget,
      2.2,
      delta,
    )

    const onOilSpin = oilSpinRef.current > 0
    const speedMul =
      (1 + boostRef.current * 0.85) *
      (hitSlowRef.current > 0 ? 0.78 : 1) *
      (onOilSpin ? 0.42 : 1) *
      (1 - peerSlowRef.current)
    const dt =
      ((reverseDirection ? -1 : 1) * baseSpeed * speedMul * delta * 60) / len
    const prevT = tRef.current
    tRef.current = (tRef.current + dt + 1) % 1

    const crossedForward = !reverseDirection && tRef.current < prevT
    const crossedReverse = reverseDirection && tRef.current > prevT + 0.5
    if (crossedForward || crossedReverse) {
      lapRef.current += 1
      onLap?.(lapRef.current, vehicleId)
    }

    const t = tRef.current
    const pos = curve.getPointAt(t)

    // Blend current + look-ahead tangents, flatten Y, then damp — kills turn jitter
    const tanNow = curve.getTangentAt(t).clone()
    tanNow.y = 0
    if (tanNow.lengthSq() < 1e-8) tanNow.set(0, 0, 1)
    else tanNow.normalize()

    const tLook = (t + (reverseDirection ? -0.018 : 0.018) + 1) % 1
    const tanLook = curve.getTangentAt(tLook).clone()
    tanLook.y = 0
    if (tanLook.lengthSq() < 1e-8) tanLook.copy(tanNow)
    else tanLook.normalize()
    if (reverseDirection) {
      tanNow.negate()
      tanLook.negate()
    }

    const desiredTan = tanNow.clone().lerp(tanLook, 0.55).normalize()
    const tanBlend = 1 - Math.exp(-6.5 * delta)
    if (!motionReadyRef.current) {
      smoothTanRef.current.copy(desiredTan)
    } else {
      smoothTanRef.current.lerp(desiredTan, tanBlend).normalize()
    }
    const tangent = smoothTanRef.current
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
      oilSlide +
      waterLatRef.current

    const clampedLateral = THREE.MathUtils.clamp(
      lateral,
      -ROAD_HALF + 0.15,
      ROAD_HALF - 0.15,
    )
    lateralOutRef.current = clampedLateral

    // jumps — follow the ramp up, loft once off the crest, then land without re-bouncing
    const roadY = pos.y
    const ahead = curve.getPointAt(
      (t + (reverseDirection ? -0.02 : 0.02) + 1) % 1,
    )
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

    // Pitch from the real 3D path (horizontal tangent still used for steering)
    const rawTan = curve.getTangentAt(t).clone()
    if (reverseDirection) rawTan.negate()
    const horiz = Math.hypot(rawTan.x, rawTan.z)
    let desiredPitch = Math.atan2(rawTan.y, Math.max(horiz, 1e-6))

    const tPitch = (t + (reverseDirection ? -0.014 : 0.014) + 1) % 1
    const rawTanLook = curve.getTangentAt(tPitch).clone()
    if (reverseDirection) rawTanLook.negate()
    const horizLook = Math.hypot(rawTanLook.x, rawTanLook.z)
    const pitchLook = Math.atan2(rawTanLook.y, Math.max(horizLook, 1e-6))
    desiredPitch = THREE.MathUtils.lerp(desiredPitch, pitchLook, 0.45)

    if (wasAirborne.current) {
      // Follow the loft a bit so the nose rises/falls in the air
      const airPitch =
        Math.atan2(airVelRef.current, Math.max(baseSpeed * 45, 5)) * 0.8
      desiredPitch = THREE.MathUtils.lerp(desiredPitch, airPitch, 0.7)
    }
    desiredPitch = THREE.MathUtils.clamp(desiredPitch, -0.9, 0.9)

    if (!motionReadyRef.current) {
      smoothPitchRef.current = desiredPitch
    } else {
      smoothPitchRef.current = THREE.MathUtils.damp(
        smoothPitchRef.current,
        desiredPitch,
        11,
        delta,
      )
    }

    const targetPos = pos.clone().addScaledVector(side, clampedLateral)
    // Slight lift on steep ramps so the body clears the asphalt
    targetPos.y =
      y + 0.05 + Math.abs(Math.sin(smoothPitchRef.current)) * 0.12
    // Wheelie pivots around rear contact — lift so the back tire stays planted
    if (wheelie > 0.001) {
      const rearLever = 0.55
      targetPos.y += rearLever * Math.sin(wheelie)
    }

    if (!motionReadyRef.current) {
      smoothPosRef.current.copy(targetPos)
    } else {
      smoothPosRef.current.x = THREE.MathUtils.damp(
        smoothPosRef.current.x,
        targetPos.x,
        16,
        delta,
      )
      smoothPosRef.current.z = THREE.MathUtils.damp(
        smoothPosRef.current.z,
        targetPos.z,
        16,
        delta,
      )
      smoothPosRef.current.y = THREE.MathUtils.damp(
        smoothPosRef.current.y,
        targetPos.y,
        11,
        delta,
      )
    }
    const finalPos = smoothPosRef.current

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
    // Level look target keeps yaw upright (no bank/roll on turns)
    lookTarget.y = finalPos.y
    const dummy = new THREE.Object3D()
    dummy.position.copy(finalPos)
    dummy.up.set(0, 1, 0)
    dummy.lookAt(lookTarget)
    // Pitch onto the road / jump — smooth & seamless with the ramp
    dummy.rotateX(-smoothPitchRef.current)
    // Motorcycle wheelie: nose up (front tire elevates), rear stays down
    // Local +X rotates the opposite of road-climb pitch, so negate.
    if (wheelie > 0.001) {
      dummy.rotateX(-wheelie)
    }

    dummy.rotateY(
      hitSpinRef.current * 0.035 + oilAngleRef.current + waterYawRef.current,
    )
    if (shakeRef.current > 0) {
      dummy.rotateZ(Math.sin(state.clock.elapsedTime * 28) * 0.045 * shakeRef.current)
    }
    if (onOilSpin) {
      // Slight tilt while spinning out
      dummy.rotateZ(Math.sin(oilAngleRef.current) * 0.12)
    } else if (Math.abs(waterYawRef.current) > 0.02) {
      // Bank slightly into the water skid
      dummy.rotateZ(-waterYawRef.current * 0.45)
    }

    if (!motionReadyRef.current) {
      smoothQuatRef.current.copy(dummy.quaternion)
      motionReadyRef.current = true
    } else {
      const rotBlend = 1 - Math.exp(-8.5 * delta)
      smoothQuatRef.current.slerp(dummy.quaternion, rotBlend)
    }

    if (groupRef.current) {
      groupRef.current.position.copy(finalPos)
      groupRef.current.quaternion.copy(smoothQuatRef.current)
    }

    stateRef.current = {
      position: finalPos.clone(),
      quaternion: smoothQuatRef.current.clone(),
      t,
      lap: lapRef.current,
      lateral: clampedLateral,
      vehicleId,
    }

    if (peersRef) {
      const slot = peersRef.current[racerIndex] ?? {
        t: 0,
        lap: 0,
        lateral: 0,
        radius: carRadius,
        active: true,
      }
      slot.t = t
      slot.lap = lapRef.current
      slot.lateral = clampedLateral
      slot.radius = carRadius
      slot.active = true
      peersRef.current[racerIndex] = slot
    }

    if (chaseCam) {
      const dist = chaseDistance
      const height = Math.max(2.2, dist * 0.48)
      // Orbit around the car: rotate the chase offset in the ground plane
      const back = tangent.clone().multiplyScalar(-1)
      back.applyAxisAngle(new THREE.Vector3(0, 1, 0), chaseOrbit)
      back.normalize()
      const camBehind = finalPos
        .clone()
        .addScaledVector(back, dist)
        .add(new THREE.Vector3(0, height, 0))
      state.camera.position.lerp(camBehind, 1 - Math.pow(0.08, delta * 60))
      // Look at the car itself. Only nudge look-ahead when nearly behind —
      // side/front orbits must stay centered on the vehicle, not far ahead.
      const rearFactor = Math.max(0, Math.cos(chaseOrbit)) ** 2
      const look = finalPos.clone()
      look.y += 0.85
      look.addScaledVector(tangent, rearFactor * Math.min(2.2, dist * 0.18))
      state.camera.lookAt(look)
    }
  })

  return (
    <group ref={groupRef}>
      {url ? (
        <ErrBoundary fallback={fallback}>
          <LoadedVehicle
            url={url}
            id={vehicleId}
            color={vehicleColor}
            wrapMap={wrapMap}
            look={vehicleLook}
          />
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
