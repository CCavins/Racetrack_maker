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
  adoptRaceSession,
  applyPoseSnapshot,
  clearRacePoseBridge,
  ensureLocalRacePoseBridge,
  getRacePoseBridge,
  MARKER_COLORS,
  POSE_STRIDE,
  RACE_POSE_CHANNEL,
  type RacePoseSnapshot,
  type RaceSessionMessage,
} from './racePoseBridge'
import './SpectatorView.css'

function OverviewCamera({
  minX,
  maxX,
  minZ,
  maxZ,
}: {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}) {
  const { camera, size } = useThree()

  useLayoutEffect(() => {
    const persp = camera as THREE.PerspectiveCamera
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const halfW = Math.max((maxX - minX) / 2, 4)
    const halfD = Math.max((maxZ - minZ) / 2, 4)
    // Cover track corners + a slim roadside margin
    const radius = Math.hypot(halfW, halfD) * 1.08

    const dir = new THREE.Vector3(0.42, 0.78, 0.52).normalize()
    persp.fov = 38
    const vFov = THREE.MathUtils.degToRad(persp.fov)
    const aspect = Math.max(size.width / Math.max(size.height, 1), 0.5)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)

    // Fit the course in view without oversized empty padding
    const distV = radius / Math.sin(vFov / 2)
    const distH = radius / Math.sin(hFov / 2)
    const dist = Math.max(distV, distH, 28)

    const center = new THREE.Vector3(cx, 0, cz)
    persp.position.copy(center).addScaledVector(dir, dist)
    // Slight far-side bias so the near (screen-bottom) edge stays in frame
    const look = center.clone().addScaledVector(dir, -radius * 0.08)
    look.y = 0.35
    persp.near = 0.5
    persp.far = Math.max(320, dist * 5)
    persp.lookAt(look)
    persp.updateProjectionMatrix()
  }, [camera, size.width, size.height, minX, maxX, minZ, maxZ])

  return null
}

/** Render a touch behind live poses so BC jitter doesn’t flash the map. */
const MAP_POSE_DELAY_MS = 100
const MAP_POSE_SAMPLES = 12

type PoseSample = {
  t: number
  x: number
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
}

const _posA = new THREE.Vector3()
const _posB = new THREE.Vector3()
const _quatA = new THREE.Quaternion()
const _quatB = new THREE.Quaternion()

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
  const lastSeq = useRef(-1)
  const samples = useRef<PoseSample[]>([])

  useFrame(() => {
    const g = group.current
    if (!g) return
    const bridge = getRacePoseBridge()
    if (!bridge) return

    // Keep showing the last smooth pose through brief packet gaps
    if (index < bridge.count) {
      const o = index * POSE_STRIDE
      if (bridge.data[o + 9] && bridge.seq !== lastSeq.current) {
        lastSeq.current = bridge.seq
        const list = samples.current
        list.push({
          t: performance.now(),
          x: bridge.data[o],
          y: bridge.data[o + 1],
          z: bridge.data[o + 2],
          qx: bridge.data[o + 3],
          qy: bridge.data[o + 4],
          qz: bridge.data[o + 5],
          qw: bridge.data[o + 6],
        })
        if (list.length > MAP_POSE_SAMPLES) {
          list.splice(0, list.length - MAP_POSE_SAMPLES)
        }
      }
    }

    const list = samples.current
    if (list.length === 0) return

    const renderAt = performance.now() - MAP_POSE_DELAY_MS
    let i = 0
    while (i < list.length - 1 && list[i + 1].t <= renderAt) i++

    const a = list[i]
    const b = list[Math.min(i + 1, list.length - 1)]

    if (!visible.current) {
      // Wait until the delayed clock reaches the first sample
      if (renderAt < a.t) return
      g.position.set(a.x, a.y, a.z)
      g.quaternion.set(a.qx, a.qy, a.qz, a.qw)
      visible.current = true
      g.visible = true
      return
    }

    if (a === b || b.t <= a.t) {
      g.position.set(a.x, a.y, a.z)
      g.quaternion.set(a.qx, a.qy, a.qz, a.qw)
      return
    }

    const u = THREE.MathUtils.clamp((renderAt - a.t) / (b.t - a.t), 0, 1)
    _posA.set(a.x, a.y, a.z)
    _posB.set(b.x, b.y, b.z)
    _quatA.set(a.qx, a.qy, a.qz, a.qw)
    _quatB.set(b.qx, b.qy, b.qz, b.qw)
    g.position.lerpVectors(_posA, _posB, u)
    g.quaternion.copy(_quatA).slerp(_quatB, u)
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

function SpectatorScene({
  racers,
  raceEpoch,
}: {
  racers: VehicleId[]
  raceEpoch: number
}) {
  const { design } = useTrackStore()
  const track = useMemo(() => buildTrack3D(design), [design])
  const look = design.vehicleLook ?? 'stock'

  if (!track) return null

  const pad = 18
  const { minX, maxX, minZ, maxZ } = track.bounds
  const edge = track.roadWidth * 0.5 + 1.5
  const groundSize = Math.max(maxX - minX, maxZ - minZ) + pad * 2
  const span = Math.max(maxX - minX, maxZ - minZ, 20)

  return (
    <>
      <color attach="background" args={['#87a0b0']} />
      <fog
        attach="fog"
        args={['#9eb0bc', Math.max(80, span * 1.8), Math.max(180, span * 4)]}
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
            key={`${raceEpoch}-${id}-${i}`}
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

      <OverviewCamera
        minX={minX - edge}
        maxX={maxX + edge}
        minZ={minZ - edge}
        maxZ={maxZ + edge}
      />
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
  const { design, reloadDesignFromStorage } = useTrackStore()
  const racers = useMemo(() => getRaceVehicles(design), [design])
  const [raceEpoch, setRaceEpoch] = useState(0)
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

  // Follow race-session start/end so restart + edit→race re-bind the map.
  useEffect(() => {
    const local = ensureLocalRacePoseBridge()
    clearRacePoseBridge(local)

    const ch =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(RACE_POSE_CHANNEL)
        : null

    const onMessage = (ev: MessageEvent) => {
      const msg = ev.data as
        | RacePoseSnapshot
        | RaceSessionMessage
        | { type?: string }
      if (!msg || typeof msg !== 'object') return

      if (msg.type === 'race-session') {
        const sessionMsg = msg as RaceSessionMessage
        if (!sessionMsg.session) return
        if (sessionMsg.active) {
          adoptRaceSession(local, sessionMsg.session)
          reloadDesignFromStorage()
          setBoard([])
          setMeta((m) => ({
            ...m,
            linked: false,
            racing: false,
            countdown: null,
          }))
          setRaceEpoch((n) => n + 1)
          ch?.postMessage({ type: 'spectate-hello' })
          return
        }
        // Race left / Start over — only clear if it was our session
        if (
          local.session === sessionMsg.session ||
          local.session === 'local'
        ) {
          clearRacePoseBridge(local)
          setBoard([])
          setMeta((m) => ({
            ...m,
            linked: false,
            racing: false,
            countdown: null,
          }))
          setRaceEpoch((n) => n + 1)
        }
        return
      }

      if (msg.type !== 'race-poses') return
      if (!('cars' in msg) || !Array.isArray(msg.cars)) return
      applyPoseSnapshot(local, msg)
    }

    ch?.addEventListener('message', onMessage)
    ch?.postMessage({ type: 'spectate-hello' })
    const ping = window.setInterval(() => {
      if (local.session === 'local' || local.seq === 0) {
        ch?.postMessage({ type: 'spectate-hello' })
      }
    }, 1000)

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === 'circuit-sketch-v1' || ev.key === 'circuit-sketch-wrap-v1') {
        reloadDesignFromStorage()
      }
    }
    window.addEventListener('storage', onStorage)

    return () => {
      window.clearInterval(ping)
      window.removeEventListener('storage', onStorage)
      ch?.removeEventListener('message', onMessage)
      ch?.close()
    }
  }, [reloadDesignFromStorage])

  useEffect(() => {
    let raf = 0
    let lastHud = 0
    let emptySince: number | null = null
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
        if (rows.length > 0) {
          emptySince = null
          setBoard(rows)
          setMeta({
            racing: bridge.racing,
            countdown: bridge.countdown,
            lapCount: bridge.lapCount,
            linked: true,
          })
        } else {
          // Ignore brief gaps so the HUD doesn’t flash “Waiting…”
          if (emptySince == null) emptySince = now
          if (now - emptySince > 450) {
            setBoard([])
            setMeta((m) => ({
              ...m,
              racing: bridge.racing,
              countdown: bridge.countdown,
              lapCount: bridge.lapCount,
              linked: false,
            }))
          } else {
            setMeta((m) => ({
              ...m,
              racing: bridge.racing,
              countdown: bridge.countdown,
              lapCount: bridge.lapCount,
            }))
          }
        }
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
          <SpectatorScene racers={racers} raceEpoch={raceEpoch} />
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
