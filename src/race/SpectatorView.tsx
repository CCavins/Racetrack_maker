import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { buildTrack3D } from '../lib/buildTrack3D'
import { useTrackStore } from '../state/trackStore'
import { getRaceVehicles, VEHICLE_META, type VehicleId } from '../types'
import { TrackMesh } from './TrackMesh'
import { PropInstances } from './PropInstances'
import { RaceVehicleVisual } from './Vehicle'
import {
  applyPoseSnapshot,
  ensureLocalRacePoseBridge,
  getRacePoseBridge,
  MARKER_COLORS,
  POSE_STRIDE,
  RACE_POSE_CHANNEL,
  type RacePoseSnapshot,
} from './racePoseBridge'
import './SpectatorView.css'

function OverviewCamera({
  center,
  span,
}: {
  center: THREE.Vector3
  span: number
}) {
  const { camera } = useThree()

  useLayoutEffect(() => {
    const dist = Math.max(36, span * 1.15)
    camera.position.set(
      center.x + dist * 0.38,
      center.y + dist * 0.72,
      center.z + dist * 0.48,
    )
    camera.near = 0.5
    camera.far = Math.max(280, dist * 5)
    if ('fov' in camera) {
      ;(camera as THREE.PerspectiveCamera).fov = 42
      ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix()
    }
    camera.lookAt(center.x, center.y + 0.4, center.z)
    camera.updateProjectionMatrix()
  }, [camera, center, span])

  return null
}

function SpectateRacer({
  index,
  vehicleId,
  vehicleLook,
  vehicleColor,
  vehicleWrap,
  beaconColor,
  showBeacon,
}: {
  index: number
  vehicleId: VehicleId
  vehicleLook: 'stock' | 'paint' | 'wrap'
  vehicleColor: string
  vehicleWrap: string | null
  beaconColor: string
  showBeacon: boolean
}) {
  const group = useRef<THREE.Group>(null)
  const visible = useRef(false)
  const targetPos = useRef(new THREE.Vector3())
  const targetQuat = useRef(new THREE.Quaternion())
  const lastSeq = useRef(-1)

  useFrame((_, rawDelta) => {
    const g = group.current
    if (!g) return
    const bridge = getRacePoseBridge()
    if (!bridge || index >= bridge.count) return
    const o = index * POSE_STRIDE
    if (!bridge.data[o + 9]) return

    // Pull a new target only when the bridge advances (no double-apply flicker)
    if (bridge.seq !== lastSeq.current) {
      lastSeq.current = bridge.seq
      targetPos.current.set(
        bridge.data[o],
        bridge.data[o + 1],
        bridge.data[o + 2],
      )
      targetQuat.current.set(
        bridge.data[o + 3],
        bridge.data[o + 4],
        bridge.data[o + 5],
        bridge.data[o + 6],
      )
      if (!visible.current) {
        g.position.copy(targetPos.current)
        g.quaternion.copy(targetQuat.current)
        visible.current = true
        g.visible = true
        return
      }
    }

    if (!visible.current) return

    const delta = Math.min(rawDelta, 1 / 20)
    // Smooth follow — hides sparse BC ticks without rubber-banding to a second source
    const blend = 1 - Math.exp(-14 * delta)
    g.position.lerp(targetPos.current, blend)
    g.quaternion.slerp(targetQuat.current, blend)
  })

  return (
    <group ref={group} visible={false}>
      <RaceVehicleVisual
        vehicleId={vehicleId}
        vehicleLook={vehicleLook}
        vehicleColor={vehicleColor}
        vehicleWrap={vehicleWrap}
        showBeacon={showBeacon}
        beaconColor={beaconColor}
      />
      {/* Tall map pin so cars stay readable from the overview camera */}
      <mesh position={[0, 3.2, 0]} castShadow={false}>
        <cylinderGeometry args={[0.18, 0.18, 6.2, 8]} />
        <meshBasicMaterial color={beaconColor} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 6.5, 0]}>
        <sphereGeometry args={[0.55, 12, 12]} />
        <meshBasicMaterial color={beaconColor} />
      </mesh>
    </group>
  )
}

function SpectatorScene({ racers }: { racers: VehicleId[] }) {
  const { design } = useTrackStore()
  const track = useMemo(() => buildTrack3D(design), [design])
  const look = design.vehicleLook ?? 'stock'
  const center = useMemo(() => {
    if (!track) return new THREE.Vector3(0, 0, 0)
    const { minX, maxX, minZ, maxZ } = track.bounds
    return new THREE.Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2)
  }, [track])

  if (!track) return null

  const pad = 18
  const { minX, maxX, minZ, maxZ } = track.bounds
  const groundSize = Math.max(maxX - minX, maxZ - minZ) + pad * 2
  const span = Math.max(maxX - minX, maxZ - minZ, 20)

  return (
    <>
      <color attach="background" args={['#87a0b0']} />
      <fog
        attach="fog"
        args={['#9eb0bc', Math.max(60, span * 1.4), Math.max(140, span * 3)]}
      />
      <ambientLight intensity={0.92} />
      <hemisphereLight args={['#f0f4f8', '#6a7a5c', 1.05]} />
      <directionalLight
        castShadow
        position={[35, 48, 22]}
        intensity={1.75}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={160}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-bias={-0.0002}
      />
      <directionalLight
        position={[-28, 22, -18]}
        intensity={0.55}
        color="#c8daf0"
      />
      <directionalLight
        position={[8, 14, -30]}
        intensity={0.35}
        color="#ffe8d0"
      />
      <Sky sunPosition={[100, 40, 40]} turbidity={4} rayleigh={1.2} />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
      >
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial color="#4a6b52" roughness={1} />
      </mesh>

      <TrackMesh track={track} />
      <PropInstances
        props={track.props}
        decals={track.decals}
        roadWidth={track.roadWidth}
      />

      {racers.map((id, i) => {
        const focused = design.vehicle === id
        const racerLook = focused ? look : 'stock'
        const vehicleColor =
          focused && look === 'paint'
            ? (design.vehicleColor ?? VEHICLE_META[id].color)
            : VEHICLE_META[id].color
        const vehicleWrap =
          focused && look === 'wrap' ? design.vehicleWrap : null
        return (
          <SpectateRacer
            key={`${id}-${i}`}
            index={i}
            vehicleId={id}
            vehicleLook={racerLook}
            vehicleColor={vehicleColor}
            vehicleWrap={vehicleWrap}
            beaconColor={MARKER_COLORS[i] ?? MARKER_COLORS[0]}
            showBeacon
          />
        )
      })}

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.28}
        scale={groundSize}
        blur={2.8}
        far={12}
      />

      <OverviewCamera center={center} span={span} />
    </>
  )
}

type BoardRow = {
  index: number
  label: string
  color: string
  place: number
  lap: number
}

export function SpectatorView() {
  const { design } = useTrackStore()
  const racers = useMemo(() => getRaceVehicles(design), [design])
  const [board, setBoard] = useState<BoardRow[]>([])
  const [meta, setMeta] = useState<{
    racing: boolean
    countdown: number | 'go' | null
    lapCount: number
    linked: boolean
  }>({
    racing: false,
    countdown: null,
    lapCount: 3,
    linked: false,
  })

  useEffect(() => {
    document.title = 'Circuit Sketch · Map'
  }, [])

  // BroadcastChannel only — never copy TypedArrays from window.opener (stale grid poses).
  useEffect(() => {
    const local = ensureLocalRacePoseBridge()
    // Reset so a refreshed map can lock onto the current race session
    local.session = 'local'
    local.seq = 0

    const ch =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(RACE_POSE_CHANNEL)
        : null

    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data as RacePoseSnapshot | { type?: string }
      if (!msg || msg.type !== 'race-poses') return
      if (!('cars' in msg) || !Array.isArray(msg.cars)) return
      applyPoseSnapshot(local, msg)
    }

    ch?.addEventListener('message', onMessage)
    ch?.postMessage({ type: 'spectate-hello' })
    const ping = window.setInterval(() => {
      // Re-request only while still waiting for the first pose
      if (local.session === 'local' || local.seq === 0) {
        ch?.postMessage({ type: 'spectate-hello' })
      }
    }, 1000)

    return () => {
      window.clearInterval(ping)
      ch?.removeEventListener('message', onMessage)
      ch?.close()
    }
  }, [])

  useEffect(() => {
    let raf = 0
    let lastHud = 0
    const tick = (now: number) => {
      const bridge = getRacePoseBridge()
      if (bridge && now - lastHud > 200) {
        lastHud = now
        const rows: BoardRow[] = []
        for (let i = 0; i < bridge.count; i++) {
          const o = i * POSE_STRIDE
          if (!bridge.data[o + 9]) continue
          rows.push({
            index: i,
            label: bridge.labels[i] || `Racer ${i + 1}`,
            color: bridge.colors[i] || MARKER_COLORS[0],
            place: bridge.data[o + 8] || i + 1,
            lap: bridge.data[o + 7] || 0,
          })
        }
        rows.sort((a, b) => a.place - b.place)
        setBoard(rows)
        setMeta({
          racing: bridge.racing,
          countdown: bridge.countdown,
          lapCount: bridge.lapCount,
          linked: rows.length > 0,
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const status = !meta.linked
    ? 'Waiting for race window… (open Map from the race HUD)'
    : meta.countdown != null
      ? meta.countdown === 'go'
        ? 'GO'
        : `Countdown ${meta.countdown}`
      : meta.racing
        ? `Live · ${meta.lapCount} laps`
        : 'Grid / finished'

  return (
    <div className="spectator-view">
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ position: [40, 55, 45], fov: 42, near: 0.5, far: 400 }}
        dpr={[1, 1.75]}
      >
        <Suspense fallback={null}>
          <SpectatorScene racers={racers} />
        </Suspense>
      </Canvas>

      <div className="spectator-hud">
        <div className="spectator-hud-left">
          <p className="spectator-brand">Circuit Sketch</p>
          <p className="spectator-meta">Course map · {status}</p>
        </div>
        <ol className="spectator-board">
          {board.map((car) => (
            <li key={car.index}>
              <span
                className="spectator-dot"
                style={{ background: car.color }}
              />
              <span className="spectator-place">P{car.place}</span>
              <span className="spectator-name">{car.label}</span>
              <span className="spectator-lap">
                L{Math.min(car.lap + 1, meta.lapCount)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
