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
import {
  VEHICLE_META,
  isMotorcycle,
  type VehicleId,
  type VehicleLookMode,
} from '../types'
import { recolorBodyMaterials } from '../lib/vehicleStyle'
import { POWER_GATE_LIFT, speed01ToBase } from '../midi/midiTypes'

const VEHICLE_URLS: Record<VehicleId, string> = {
  hovercar: `${import.meta.env.BASE_URL}assets/vehicles/hovercar.glb`,
  cruiser: `${import.meta.env.BASE_URL}assets/vehicles/cruiser.glb`,
  muscle: `${import.meta.env.BASE_URL}assets/vehicles/muscle.glb`,
  canyon: `${import.meta.env.BASE_URL}assets/vehicles/canyon.glb`,
  thunderbolt: `${import.meta.env.BASE_URL}assets/vehicles/thunderbolt.glb`,
  cheetah: `${import.meta.env.BASE_URL}assets/vehicles/cheetah.glb`,
  lct: `${import.meta.env.BASE_URL}assets/vehicles/lct.glb`,
  motorcycle: `${import.meta.env.BASE_URL}assets/vehicles/motorcycle.glb`,
  cb750: `${import.meta.env.BASE_URL}assets/vehicles/cb750.glb`,
  cyberbike: `${import.meta.env.BASE_URL}assets/vehicles/cyberbike.glb`,
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
}

const AVAILABLE_VEHICLE_GLBS = new Set<VehicleId>(Object.keys(VEHICLE_URLS) as VehicleId[])

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
    if (isMotorcycle(id)) {
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
          : isMotorcycle(id)
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
      canyon: Math.PI,
      thunderbolt: Math.PI,
      cheetah: Math.PI,
      lct: Math.PI,
      cb750: Math.PI,
      cyberbike: Math.PI,
    }
    c.rotation.y += facingFlip[id] ?? 0

    root.add(c)
    // Sketchfab exports (e.g. cruiser) can be far from origin — recenter XZ
    // so the path / chase marker line up with the body, then plant on the ground.
    const box3 = new THREE.Box3().setFromObject(root)
    const center = new THREE.Vector3()
    box3.getCenter(center)
    c.position.x -= center.x
    c.position.z -= center.z
    c.updateMatrixWorld(true)
    const box4 = new THREE.Box3().setFromObject(root)
    root.position.y -= box4.min.y

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

export type GripLevel = 'green' | 'amber' | 'red'

export type VehicleState = {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  t: number
  lap: number
  lateral: number
  vehicleId: VehicleId
  /** Slot-car grip feedback for HUD */
  grip: GripLevel
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
  /** Marker / leaderboard color for this racer */
  beaconColor?: string
  /** When false, hold still until assets / scene are ready */
  running?: boolean
  /** When false, stay posed but do not integrate (countdown) */
  motionEnabled?: boolean
  /** Full laps to complete before finishing */
  lapCount?: number
  stateRef: MutableRefObject<VehicleState>
  /** Index into peersRef for this racer */
  racerIndex?: number
  peersRef?: MutableRefObject<PeerSnapshot[]>
  /** Starting progress along the lap */
  startT?: number
  /** Starting lateral lane offset */
  startLateral?: number
  /** Normalized MIDI/slider speed 0–1 for this lineup slot */
  speed01Ref?: MutableRefObject<number>
  /**
   * When true, ignore live MIDI and use countdownLatchRef (frozen for start).
   * When false/racing, follow speed01Ref live.
   */
  throttleFrozen?: boolean
  /** Captured speed01 at countdown start / GO latch */
  countdownLatchRef?: MutableRefObject<number>
  onLap?: (lap: number, vehicleId: VehicleId) => void
  onFinished?: (vehicleId: VehicleId, racerIndex: number) => void
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
  beaconColor = '#e8b923',
  running = true,
  motionEnabled = true,
  lapCount = 3,
  stateRef,
  racerIndex = 0,
  peersRef,
  startT = 0,
  startLateral = 0,
  speed01Ref,
  throttleFrozen = false,
  countdownLatchRef,
  onLap,
  onFinished,
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
  /** Sticky pass side while overtaking (-1 / 0 / 1) */
  const passSideRef = useRef(0)
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
  /** Accumulated overspeed drift off the racing line */
  const cornerDriftRef = useRef(0)
  /** Seconds before another corner spin-out can fire */
  const spinCooldownRef = useRef(0)
  const finishedRef = useRef(false)
  /** Smoothed throttle (inertia / coast) */
  const actualBaseRef = useRef(0.02)
  /** Builds while carrying excess speed into bends */
  const deslotRef = useRef(0)
  /** Must lift knob after a spin before power returns */
  const powerGateRef = useRef(false)
  const powerGateLiftHoldRef = useRef(0)
  const defaultSpeed01Ref = useRef(0.28)
  const speedRef = speed01Ref ?? defaultSpeed01Ref
  const gripRef = useRef<GripLevel>('green')

  const wrapMap = useMemo(() => {
    if (vehicleLook !== 'wrap' || !vehicleWrap) return null
    const loader = new THREE.TextureLoader()
    const tex = loader.load(vehicleWrap)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.flipY = true
    tex.needsUpdate = true
    return tex
  }, [vehicleWrap, vehicleLook])

  const carRadius =
    vehicleId === 'truck' || vehicleId === 'ambulance'
      ? 1.1
      : vehicleId === 'suv' || vehicleId === 'van'
        ? 0.95
        : isMotorcycle(vehicleId)
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
    const canMove = motionEnabled && !finishedRef.current
    const asphaltHalf = track.roadWidth / 2
    const lateralLimit = asphaltHalf + 1.1

    if (boostRef.current > 0) boostRef.current = Math.max(0, boostRef.current - delta)
    if (hitSlowRef.current > 0) hitSlowRef.current = Math.max(0, hitSlowRef.current - delta)
    if (hitCooldownRef.current > 0) hitCooldownRef.current = Math.max(0, hitCooldownRef.current - delta)
    if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - delta)
    if (waterCooldownRef.current > 0) {
      waterCooldownRef.current = Math.max(0, waterCooldownRef.current - delta)
    }
    if (spinCooldownRef.current > 0) {
      spinCooldownRef.current = Math.max(0, spinCooldownRef.current - delta)
    }
    hitSpinRef.current *= Math.pow(0.82, delta * 60)
    hitLatVelRef.current *= Math.pow(0.86, delta * 60)

    const tNow = ((tRef.current % 1) + 1) % 1
    const lookAhead = curve.getPointAt(tNow)

    // Decal effects (boost / oil / water) by world proximity
    let onOil = false
    let onWater = false
    if (canMove) {
      for (const d of track.decals) {
        const dist = lookAhead.distanceTo(d.position)
        const reach = d.kind === 'boost' ? 2.6 : d.kind === 'oil' ? 2.2 : 2.0
        if (dist < reach * d.scale) {
          if (d.kind === 'boost') {
            if (
              isMotorcycle(vehicleId) &&
              boostRef.current < 0.2 &&
              wheelieTRef.current < 0
            ) {
              wheelieTRef.current = 0
            }
            boostRef.current = Math.max(boostRef.current, 1.4)
          }
          if (d.kind === 'oil') {
            onOil = true
            if (oilSpinRef.current <= 0) {
              powerGateRef.current = true
              powerGateLiftHoldRef.current = 0
            }
            oilSpinRef.current = Math.max(oilSpinRef.current, 1.45)
          }
          if (d.kind === 'water') {
            onWater = true
          }
        }
      }
    }

    // Motorcycle-only wheelie: 2s, nose up 30°, rear stays planted
    const WHEELIE_DUR = 2
    const WHEELIE_MAX = Math.PI / 6 // 30°
    let wheelieAngle = 0
    if (isMotorcycle(vehicleId) && wheelieTRef.current >= 0) {
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
    } else if (!isMotorcycle(vehicleId)) {
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
      const maxSlide = asphaltHalf - 0.35
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

    // --- Slot-car skill loop: inertia → hard maxSafe → deslot meter → power gate ---
    const knob01 = throttleFrozen
      ? (countdownLatchRef?.current ?? speedRef.current)
      : speedRef.current
    let targetBase = speed01ToBase(knob01)

    // After a spin: crawl until player lifts the knob
    if (powerGateRef.current) {
      if (knob01 < POWER_GATE_LIFT) {
        powerGateLiftHoldRef.current += delta
        if (powerGateLiftHoldRef.current >= 0.25) {
          powerGateRef.current = false
          powerGateLiftHoldRef.current = 0
        }
      } else {
        powerGateLiftHoldRef.current = 0
      }
      if (powerGateRef.current) {
        targetBase = Math.min(targetBase, 0.035)
      }
    }

    // Inertia: snappy accel, slower coast (must lift early for corners)
    {
      const cur = actualBaseRef.current
      const rising = targetBase > cur
      const rate = rising ? 10 : 3.2 // ~0.2s accel, ~0.55s coast
      const k = 1 - Math.exp(-rate * delta)
      actualBaseRef.current = cur + (targetBase - cur) * k
      if (!canMove) {
        // Countdown: track target but don't coast-spin up from zero mid-count
        actualBaseRef.current = targetBase
      }
    }
    const actualBase = actualBaseRef.current

    const lookNear = 0.0025
    const lookFar = 0.035
    const tanFlat = curve.getTangentAt(tNow).clone()
    tanFlat.y = 0
    if (tanFlat.lengthSq() > 1e-8) tanFlat.normalize()
    else tanFlat.set(0, 0, 1)
    const tNear = (tNow + (reverseDirection ? -lookNear : lookNear) + 1) % 1
    const tFar = (tNow + (reverseDirection ? -lookFar : lookFar) + 1) % 1
    const tanNear = curve.getTangentAt(tNear).clone()
    const tanFar = curve.getTangentAt(tFar).clone()
    tanNear.y = 0
    tanFar.y = 0
    if (tanNear.lengthSq() > 1e-8) tanNear.normalize()
    if (tanFar.lengthSq() > 1e-8) tanFar.normalize()
    if (reverseDirection) {
      tanFlat.negate()
      tanNear.negate()
      tanFar.negate()
    }
    const turnNear = Math.acos(
      THREE.MathUtils.clamp(tanFlat.dot(tanNear), -1, 1),
    )
    const turnFar = Math.acos(
      THREE.MathUtils.clamp(tanFlat.dot(tanFar), -1, 1),
    )
    const turnFactor = Math.max(
      THREE.MathUtils.smoothstep(0.004, 0.07, turnNear),
      THREE.MathUtils.smoothstep(0.012, 0.2, turnFar),
    )
    const turnSigned = tanFlat.x * tanFar.z - tanFlat.z * tanFar.x
    const outward = Math.sign(turnSigned || 1)

    let obstacleThreat = 0
    if (canMove) {
      const threatWindow = 0.08
      for (const obs of track.obstacles) {
        let dto = obs.t - tNow
        if (dto < -0.5) dto += 1
        if (dto > 0.5) dto -= 1
        if (reverseDirection) dto = -dto
        if (dto < -0.005 || dto > threatWindow) continue
        const latGap = Math.abs(obs.lateral - lateralOutRef.current)
        if (latGap > obs.radius + carRadius + 0.9) continue
        obstacleThreat = Math.max(obstacleThreat, 1 - dto / threatWindow)
      }
    }

    // Straight ≈ 0.42 · medium ≈ 0.09 · hairpin ≈ 0.04
    const bendSafe = 0.035 + 0.385 * Math.pow(1 - turnFactor, 3.0)
    const maxSafe =
      bendSafe * THREE.MathUtils.lerp(1, 0.35, obstacleThreat)

    const provisionalMul =
      (1 + boostRef.current * 0.45) *
      (hitSlowRef.current > 0 ? 0.7 : 1) *
      (oilSpinRef.current > 0 ? 0.35 : 1) *
      (1 - peerSlowRef.current)

    const desired = actualBase * provisionalMul
    const excess = Math.max(0, desired - maxSafe)
    const capped = Math.min(desired, maxSafe)
    const underControl =
      canMove && excess < 0.002 && oilSpinRef.current <= 0 && deslotRef.current < 0.15
    const overspeeding = canMove && excess > 0.002 && oilSpinRef.current <= 0

    // Deslot meter — builds even near centerline; forces the lift
    if (canMove && excess > 0) {
      deslotRef.current +=
        excess * (0.55 + turnFactor * 1.4) * delta * 60 * 0.55
    } else if (canMove) {
      deslotRef.current = Math.max(0, deslotRef.current - delta * 1.1)
    } else {
      deslotRef.current = 0
    }
    deslotRef.current = Math.min(deslotRef.current, 1.35)

    gripRef.current =
      excess > 0.004 || deslotRef.current > 0.35
        ? 'red'
        : desired > maxSafe * 0.82 || deslotRef.current > 0.12
          ? 'amber'
          : 'green'

    // Prefer grid lane when calm; never fight a slide/spin
    let avoidTarget = startLateral
    let peerSlow = 0
    let strongestPass = 0
    let passing = false

    if (underControl) {
      avoidTarget = startLateral
      const lookWindow = 0.09
      for (const obs of track.obstacles) {
        let dt = obs.t - tNow
        if (dt < -0.5) dt += 1
        if (dt > 0.5) dt -= 1
        if (reverseDirection) dt = -dt
        if (dt < -0.01 || dt > lookWindow) continue

        const sidePref =
          Math.abs(obs.lateral) < 0.15
            ? obs.position.x * 0.37 + obs.position.z * 0.71 >= 0
              ? 1
              : -1
            : -Math.sign(obs.lateral)

        const urgency = 1 - dt / lookWindow
        const clearance = Math.min(
          asphaltHalf - 0.4,
          obs.radius + carRadius + 0.5,
        )
        avoidTarget += sidePref * clearance * urgency
      }

      const peers = peersRef?.current
      if (peers) {
        const myLat = lateralOutRef.current
        const passLook = 0.085
        for (let i = 0; i < peers.length; i++) {
          if (i === racerIndex) continue
          const peer = peers[i]
          if (!peer?.active) continue

          let dProg = peer.lap - lapRef.current + (peer.t - tNow)
          if (reverseDirection) dProg = -dProg
          if (dProg > 0.5) dProg -= 1
          if (dProg < -0.5) dProg += 1

          const latGap = peer.lateral - myLat
          const absLat = Math.abs(latGap)
          const needSep = carRadius + peer.radius + 0.65

          if (dProg > 0.004 && dProg < passLook) {
            const along = 1 - dProg / passLook
            const blocking = absLat < needSep * 0.95
            if (blocking || Math.abs(peer.lateral) < 0.55) {
              passing = true
              let side = passSideRef.current
              if (side === 0) {
                if (Math.abs(peer.lateral) > 0.18) {
                  side = -Math.sign(peer.lateral)
                } else if (Math.abs(myLat) > 0.12) {
                  side = Math.sign(myLat)
                } else {
                  side = racerIndex % 2 === 0 ? 1 : -1
                }
                passSideRef.current = side
              }
              const passLane =
                side * Math.min(asphaltHalf - 0.35, needSep * 0.9)
              const desire = passLane * (0.35 + along * 0.65)
              if (Math.abs(desire) > Math.abs(strongestPass)) {
                strongestPass = desire
              }
              if (absLat < needSep * 0.45) {
                peerSlow = Math.max(peerSlow, along * 0.18)
              }
            }
          }

          if (Math.abs(dProg) < 0.028 && absLat < needSep * 0.85) {
            passing = true
            const side =
              absLat < 0.08
                ? passSideRef.current || (racerIndex % 2 === 0 ? 1 : -1)
                : -Math.sign(latGap || 1)
            passSideRef.current = side
            const overlap = (needSep - absLat) / needSep
            const desire =
              side * Math.min(asphaltHalf - 0.4, needSep * 0.75) * overlap
            if (Math.abs(desire) > Math.abs(strongestPass)) {
              strongestPass = desire
            }
          }
        }
      }
      if (!passing) passSideRef.current = 0
      if (Math.abs(strongestPass) > 0.01) {
        avoidTarget =
          Math.abs(strongestPass) >= Math.abs(avoidTarget)
            ? strongestPass
            : avoidTarget * 0.35 + strongestPass
      }

      peerSlowRef.current = THREE.MathUtils.damp(
        peerSlowRef.current,
        peerSlow,
        4,
        delta,
      )

      avoidTarget = THREE.MathUtils.clamp(
        avoidTarget,
        -asphaltHalf + 0.25,
        asphaltHalf - 0.25,
      )
      const avoidRate = Math.abs(avoidTarget - startLateral) > 0.25 ? 3.2 : 2.2
      avoidLatRef.current = THREE.MathUtils.damp(
        avoidLatRef.current,
        avoidTarget,
        avoidRate,
        delta,
      )
    } else if (!canMove) {
      avoidLatRef.current = startLateral
      cornerDriftRef.current = 0
      deslotRef.current = 0
      peerSlowRef.current = 0
      passSideRef.current = 0
      oilSpinRef.current = 0
      oilAngleRef.current = 0
      waterLatRef.current = 0
      hitLatVelRef.current = 0
      powerGateRef.current = false
      powerGateLiftHoldRef.current = 0
    } else {
      // Overspeed / deslot / spin: freeze centerline pull
      peerSlowRef.current = THREE.MathUtils.damp(
        peerSlowRef.current,
        0,
        6,
        delta,
      )
    }

    const onOilSpin = oilSpinRef.current > 0
    const recovering =
      onOilSpin || Math.abs(lateralOutRef.current) > asphaltHalf

    // Drift from excess + deslot meter (commits wide before spin)
    if (overspeeding || deslotRef.current > 0.2) {
      const dump =
        excess * (2.8 + 6 * excess) + deslotRef.current * 1.8
      cornerDriftRef.current += outward * dump * delta * 60
    } else if (canMove && oilSpinRef.current <= 0) {
      cornerDriftRef.current = THREE.MathUtils.damp(
        cornerDriftRef.current,
        0,
        recovering ? 2.4 : 1.6,
        delta,
      )
    }

    // Spin from deslot meter even near centerline — force the lift
    if (
      canMove &&
      oilSpinRef.current <= 0 &&
      spinCooldownRef.current <= 0 &&
      (deslotRef.current >= 0.85 ||
        (deslotRef.current >= 0.55 &&
          Math.abs(avoidLatRef.current + cornerDriftRef.current) >
            asphaltHalf * 0.55))
    ) {
      oilSpinRef.current = 1.55
      spinCooldownRef.current = 2.4
      powerGateRef.current = true
      powerGateLiftHoldRef.current = 0
      deslotRef.current = 0.4
    }

    if (oilSpinRef.current > 0) {
      cornerDriftRef.current = THREE.MathUtils.damp(
        cornerDriftRef.current,
        Math.sign(cornerDriftRef.current || outward) * asphaltHalf * 0.95,
        1.8,
        delta,
      )
    }
    cornerDriftRef.current = THREE.MathUtils.clamp(
      cornerDriftRef.current,
      -lateralLimit + 0.15,
      lateralLimit - 0.15,
    )

    const absLatNow = Math.abs(
      avoidLatRef.current + cornerDriftRef.current,
    )
    const onGrass = absLatNow > asphaltHalf

    // Hard ceiling on ribbon speed; grass still hurts
    const ribbonSpeed = canMove ? capped : 0
    const speedMul = onGrass ? 0.22 : 1
    const dt =
      ((reverseDirection ? -1 : 1) * ribbonSpeed * speedMul * delta * 60) /
      len
    const prevT = tRef.current
    tRef.current = (tRef.current + dt + 1) % 1

    const crossedForward = !reverseDirection && tRef.current < prevT
    const crossedReverse = reverseDirection && tRef.current > prevT + 0.5
    if (canMove && (crossedForward || crossedReverse)) {
      lapRef.current += 1
      onLap?.(lapRef.current, vehicleId)
      if (lapRef.current >= lapCount && !finishedRef.current) {
        finishedRef.current = true
        tRef.current = reverseDirection ? 0.995 : 0.005
        onFinished?.(vehicleId, racerIndex)
      }
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

    // Oil slide: mild sideways wobble while spinning (keep recoverable)
    const oilSlide = onOilSpin
      ? Math.sin(oilAngleRef.current) * 0.55 +
        Math.cos(oilAngleRef.current * 0.5) * 0.2
      : 0

    const lateral =
      avoidLatRef.current +
      cornerDriftRef.current +
      weave +
      hitLatVelRef.current +
      oilSlide +
      waterLatRef.current

    const clampedLateral = THREE.MathUtils.clamp(
      lateral,
      -lateralLimit + 0.15,
      lateralLimit - 0.15,
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
      grip: gripRef.current,
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
      slot.active = canMove
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
      {showBeacon && <CarBeacon color={beaconColor} />}
    </group>
  )
}

function CarBeacon({ color }: { color: string }) {
  return (
    <group position={[0, 0.2, 0]}>
      <mesh position={[0, 3.2, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 5.5, 6]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.9}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh position={[0, 6.2, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.55, 1.1, 3]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.15}
        />
      </mesh>
      <mesh position={[0, 6.2, 0]}>
        <ringGeometry args={[0.7, 1.05, 24]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
