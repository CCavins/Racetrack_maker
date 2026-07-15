import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sky, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { buildTrack3D } from '../lib/buildTrack3D'
import { useTrackStore } from '../state/trackStore'
import { useMidiControl } from '../midi/midiControlStore'
import { DEFAULT_SPEED01 } from '../midi/midiTypes'
import { VEHICLE_META, getRaceVehicles, type VehicleId } from '../types'
import { TrackMesh } from './TrackMesh'
import { PropInstances } from './PropInstances'
import { Vehicle, type GripLevel, type PeerSnapshot, type VehicleState } from './Vehicle'
import { MidiSettingsPanel } from './MidiSettingsPanel'
import './RaceView.css'

const START_T = 0

/** Side-by-side grid across the start line (same t, spaced lateral) */
function startLateralFor(
  index: number,
  count: number,
  roadWidth: number,
): number {
  if (count <= 1) return 0
  const span = (roadWidth / 2) * 0.78
  return -span / 2 + (span * index) / (count - 1)
}

/** Distinct marker colors for up to 4 racers (beacon + leaderboard) */
export const RACER_MARKER_COLORS = [
  '#e8b923',
  '#1a9fff',
  '#ef233c',
  '#06d6a0',
] as const

function emptyState(id: VehicleId): VehicleState {
  return {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    t: 0,
    lap: 0,
    lateral: 0,
    vehicleId: id,
    grip: 'green',
  }
}

function SceneReady({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    let id2 = 0
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => onReady())
    })
    return () => {
      cancelAnimationFrame(id1)
      cancelAnimationFrame(id2)
    }
  }, [onReady])
  return null
}

function SceneContent({
  chaseCam,
  chaseDistance,
  chaseOrbit,
  chaseIndex,
  showBeacons,
  onLap,
  onFinished,
  stateRefs,
  peersRef,
  speed01Refs,
  countdownLatchRefs,
  throttleFrozen,
  racers,
  running,
  motionEnabled,
  lapCount,
  onReady,
}: {
  chaseCam: boolean
  chaseDistance: number
  chaseOrbit: number
  chaseIndex: number
  showBeacons: boolean
  onLap: (n: number, vehicleId: VehicleId) => void
  onFinished: (vehicleId: VehicleId, racerIndex: number) => void
  stateRefs: React.MutableRefObject<VehicleState>[]
  peersRef: React.MutableRefObject<PeerSnapshot[]>
  speed01Refs: React.MutableRefObject<number>[]
  countdownLatchRefs: React.MutableRefObject<number>[]
  throttleFrozen: boolean
  racers: VehicleId[]
  running: boolean
  motionEnabled: boolean
  lapCount: number
  onReady: () => void
}) {
  const { design } = useTrackStore()
  const track = useMemo(() => buildTrack3D(design), [design])

  if (!track || racers.length === 0) return null

  const pad = 18
  const { minX, maxX, minZ, maxZ } = track.bounds
  const groundSize = Math.max(maxX - minX, maxZ - minZ) + pad * 2
  const look = design.vehicleLook ?? 'stock'
  const chaseState = stateRefs[chaseIndex] ?? stateRefs[0]

  return (
    <>
      <color attach="background" args={['#87a0b0']} />
      <fog attach="fog" args={['#9eb0bc', 50, 130]} />
      <ambientLight intensity={0.92} />
      <hemisphereLight args={['#f0f4f8', '#6a7a5c', 1.05]} />
      <directionalLight
        castShadow
        position={[35, 48, 22]}
        intensity={1.75}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={120}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-28, 22, -18]} intensity={0.55} color="#c8daf0" />
      <directionalLight position={[8, 14, -30]} intensity={0.35} color="#ffe8d0" />
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
          <Vehicle
            key={`${id}-${i}`}
            track={track}
            vehicleId={id}
            vehicleLook={racerLook}
            vehicleColor={vehicleColor}
            vehicleWrap={vehicleWrap}
            reverseDirection={design.reverseDirection}
            chaseCam={chaseCam && i === chaseIndex}
            chaseDistance={chaseDistance}
            chaseOrbit={chaseOrbit}
            showBeacon={showBeacons}
            beaconColor={RACER_MARKER_COLORS[i] ?? RACER_MARKER_COLORS[0]}
            running={running}
            motionEnabled={motionEnabled}
            lapCount={lapCount}
            stateRef={stateRefs[i]}
            racerIndex={i}
            peersRef={peersRef}
            startT={START_T}
            startLateral={startLateralFor(i, racers.length, track.roadWidth)}
            speed01Ref={speed01Refs[i]}
            throttleFrozen={throttleFrozen}
            countdownLatchRef={countdownLatchRefs[i]}
            onLap={onLap}
            onFinished={onFinished}
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

      {!chaseCam && (
        <OrbitControls
          makeDefault
          maxPolarAngle={Math.PI / 2.1}
          minDistance={8}
          maxDistance={80}
          target={[0, 1, 0]}
        />
      )}

      {!chaseCam && chaseState && <CarScreenProjector stateRef={chaseState} />}
      <SceneReady onReady={onReady} />
    </>
  )
}

const screenBus = {
  x: 0.5,
  y: 0.5,
  visible: true,
  heading: 0,
}

function CarScreenProjector({
  stateRef,
}: {
  stateRef: React.MutableRefObject<VehicleState>
}) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    v.copy(stateRef.current.position)
    v.y += 1.2
    v.project(camera)
    const sx = (v.x * 0.5 + 0.5) * size.width
    const sy = (-v.y * 0.5 + 0.5) * size.height
    const inFront = v.z < 1
    const margin = 48
    const onScreen =
      inFront &&
      sx > margin &&
      sx < size.width - margin &&
      sy > margin &&
      sy < size.height - margin

    screenBus.visible = onScreen
    screenBus.x = sx / size.width
    screenBus.y = sy / size.height

    const cx = size.width / 2
    const cy = size.height / 2
    screenBus.heading = Math.atan2(sy - cy, sx - cx)
  })

  return null
}

function CarEdgeHint({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    let raf = 0
    const tick = () => {
      const el = ref.current
      const label = labelRef.current
      if (el && label) {
        if (screenBus.visible) {
          el.style.opacity = '0'
          label.style.opacity = '0'
        } else {
          const ang = screenBus.heading
          const pad = 28
          const ux = Math.cos(ang)
          const uy = Math.sin(ang)
          const aw = window.innerWidth
          const ah = window.innerHeight
          const cx = aw / 2
          const cy = ah / 2
          const tx = ux === 0 ? Infinity : ((ux > 0 ? aw - pad : pad) - cx) / ux
          const ty = uy === 0 ? Infinity : ((uy > 0 ? ah - pad : pad) - cy) / uy
          const t = Math.min(Math.abs(tx), Math.abs(ty))
          const x = cx + ux * t
          const y = cy + uy * t
          el.style.opacity = '1'
          el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${ang + Math.PI / 2}rad)`
          label.style.opacity = '1'
          label.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${uy > 0 ? '12px' : '-28px'})`
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  if (!active) return null

  return (
    <>
      <div ref={ref} className="car-edge-arrow" aria-hidden>
        ▲
      </div>
      <div ref={labelRef} className="car-edge-label" aria-hidden>
        Car
      </div>
    </>
  )
}

type BoardRow = {
  index: number
  id: VehicleId
  label: string
  lap: number
  t: number
  progress: number
  place: number
  grip: GripLevel
}

export function RaceView() {
  const { design, setStep, bestLapMs, recordLapTime, setLoadStatus } =
    useTrackStore()
  const { speed01Refs, setMidiListening } = useMidiControl()
  const racers = useMemo(() => getRaceVehicles(design), [design])
  const lapCount = design.lapCount ?? 3
  const [chaseCam, setChaseCam] = useState(true)
  const [chaseDistance, setChaseDistance] = useState(8)
  const [chaseOrbit, setChaseOrbit] = useState(0)
  const [chaseIndex, setChaseIndex] = useState(0)
  const [showBeacons, setShowBeacons] = useState(true)
  const [midiOpen, setMidiOpen] = useState(false)
  const [board, setBoard] = useState<BoardRow[]>([])
  const [lastLapMs, setLastLapMs] = useState<number | null>(null)
  const [sceneReady, setSceneReady] = useState(false)
  /** null = not started; number = 3/2/1; 'go' = GO flash; 'racing' | 'done' */
  const [countdown, setCountdown] = useState<number | 'go' | null>(null)
  const [racing, setRacing] = useState(false)
  const [finishOrder, setFinishOrder] = useState<
    { id: VehicleId; index: number; timeMs: number }[]
  >([])
  const lapStartRef = useRef(performance.now())
  const raceStartRef = useRef(performance.now())
  const dragRef = useRef<{ x: number; orbit: number } | null>(null)
  const chaseOrbitRef = useRef(0)
  chaseOrbitRef.current = chaseOrbit
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMidiListening(design.midiEnabled !== false)
  }, [design.midiEnabled, setMidiListening])

  const stateRefs = useMemo(
    () => racers.map((id) => ({ current: emptyState(id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset with lineup identity
    [racers.join('|')],
  )
  const peersRef = useRef<PeerSnapshot[]>(
    racers.map(() => ({
      t: 0,
      lap: 0,
      lateral: 0,
      radius: 0.75,
      active: false,
    })),
  )
  /** Frozen throttle at scene-ready — vehicles ignore live MIDI until GO */
  const countdownLatchRefs = useMemo(
    () =>
      Array.from({ length: 4 }, () => ({
        current: DEFAULT_SPEED01,
      })),
    [],
  )

  useEffect(() => {
    peersRef.current = racers.map(() => ({
      t: 0,
      lap: 0,
      lateral: 0,
      radius: 0.75,
      active: false,
    }))
    setChaseIndex(0)
    setBoard([])
    setFinishOrder([])
    setRacing(false)
    setCountdown(null)
    setSceneReady(false)
  }, [racers.join('|')])

  useEffect(() => {
    if (chaseIndex >= racers.length) setChaseIndex(0)
  }, [chaseIndex, racers.length])

  const markReady = useCallback(() => {
    setSceneReady(true)
    setLoadStatus(null)
  }, [setLoadStatus])

  // 3-2-1-GO after the scene is ready
  useEffect(() => {
    if (!sceneReady) return
    let cancelled = false
    // Latch current knob values so mid-countdown CC moves don't cheat
    for (let i = 0; i < countdownLatchRefs.length; i++) {
      countdownLatchRefs[i].current = speed01Refs[i]?.current ?? DEFAULT_SPEED01
    }
    const sleep = (ms: number) =>
      new Promise<void>((r) => window.setTimeout(r, ms))
    ;(async () => {
      for (const n of [3, 2, 1] as const) {
        if (cancelled) return
        setCountdown(n)
        await sleep(900)
      }
      if (cancelled) return
      setCountdown('go')
      await sleep(550)
      if (cancelled) return
      setCountdown(null)
      setRacing(true)
      const now = performance.now()
      lapStartRef.current = now
      raceStartRef.current = now
    })()
    return () => {
      cancelled = true
    }
  }, [sceneReady, countdownLatchRefs, speed01Refs])

  const onLap = useCallback(
    (n: number, vehicleId: VehicleId) => {
      const now = performance.now()
      const ms = now - lapStartRef.current
      if (n > 0) {
        setLastLapMs(ms)
        recordLapTime(ms)
        lapStartRef.current = now
      }
      void vehicleId
    },
    [recordLapTime],
  )

  const onFinished = useCallback(
    (vehicleId: VehicleId, racerIndex: number) => {
      setFinishOrder((prev) => {
        if (prev.some((r) => r.index === racerIndex)) return prev
        return [
          ...prev,
          {
            id: vehicleId,
            index: racerIndex,
            timeMs: performance.now() - raceStartRef.current,
          },
        ]
      })
    },
    [],
  )

  // Poll leaderboard from shared state refs (~8 Hz)
  useEffect(() => {
    if (!sceneReady) return
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      if (now - last > 120) {
        last = now
        const reverse = design.reverseDirection
        const finishedSet = new Set(finishOrder.map((r) => r.index))
        const rows: BoardRow[] = racers.map((id, index) => {
          const s = stateRefs[index]?.current
          const lap = s?.lap ?? 0
          const t = s?.t ?? 0
          const done = finishedSet.has(index)
          const finishPlace = finishOrder.findIndex((r) => r.index === index)
          const progress = done
            ? lapCount + 1 - finishPlace * 0.001
            : reverse
              ? lap + (1 - t)
              : lap + t
          return {
            index,
            id,
            label: VEHICLE_META[id].label,
            lap,
            t,
            progress,
            place: 0,
            grip: s?.grip ?? 'green',
          }
        })
        rows.sort((a, b) => b.progress - a.progress)
        rows.forEach((r, i) => {
          r.place = i + 1
        })
        setBoard(rows)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [
    sceneReady,
    racers,
    stateRefs,
    design.reverseDirection,
    finishOrder,
    lapCount,
  ])

  useEffect(() => {
    if (!sceneReady) setLoadStatus('Rendering scene…')
  }, [sceneReady, setLoadStatus])

  useEffect(() => {
    lapStartRef.current = performance.now()
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!chaseCam) return
      e.preventDefault()
      setChaseDistance((d) =>
        Math.min(22, Math.max(3.5, d + e.deltaY * 0.012)),
      )
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!chaseCam) return
      if ((e.target as HTMLElement).closest('.race-hud')) return
      dragRef.current = { x: e.clientX, orbit: chaseOrbitRef.current }
      el.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!chaseCam || !dragRef.current) return
      const dx = e.clientX - dragRef.current.x
      setChaseOrbit(dragRef.current.orbit - dx * 0.008)
    }
    const onPointerUp = (e: PointerEvent) => {
      dragRef.current = null
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
    }
  }, [chaseCam])

  const fmt = (ms: number) => {
    const s = ms / 1000
    return `${s.toFixed(2)}s`
  }

  const chaseLabel =
    racers[chaseIndex] != null
      ? VEHICLE_META[racers[chaseIndex]].label
      : 'Vehicle'
  const chasePlace =
    board.find((r) => r.index === chaseIndex)?.place ?? null
  const raceComplete =
    racers.length > 0 && finishOrder.length >= racers.length
  const fmtRace = (ms: number) => {
    const s = ms / 1000
    return s >= 60
      ? `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`
      : `${s.toFixed(2)}s`
  }

  return (
    <div className="race-view" ref={wrapRef}>
      <Canvas
        shadows
        camera={{ position: [12, 14, 18], fov: 50, near: 0.1, far: 200 }}
        dpr={[1, 1.75]}
      >
        <Suspense fallback={null}>
          <SceneContent
            chaseCam={chaseCam}
            chaseDistance={chaseDistance}
            chaseOrbit={chaseOrbit}
            chaseIndex={chaseIndex}
            showBeacons={showBeacons}
            onLap={onLap}
            onFinished={onFinished}
            stateRefs={stateRefs}
            peersRef={peersRef}
            speed01Refs={speed01Refs}
            countdownLatchRefs={countdownLatchRefs}
            throttleFrozen={!racing}
            racers={racers}
            running={sceneReady}
            motionEnabled={racing}
            lapCount={lapCount}
            onReady={markReady}
          />
        </Suspense>
      </Canvas>

      {!sceneReady && (
        <div className="generating-overlay race-loading-overlay">
          <div className="generating-card">
            <p className="generating-title">Loading scene</p>
            <p className="generating-sub">
              Waiting for vehicles, props, and textures…
            </p>
            <div className="generating-bar">
              <span />
            </div>
          </div>
        </div>
      )}

      {sceneReady && countdown != null && (
        <div className="race-countdown" aria-live="assertive">
          <span className={countdown === 'go' ? 'go' : ''}>
            {countdown === 'go' ? 'GO' : countdown}
          </span>
        </div>
      )}

      {raceComplete && (
        <div className="race-results" role="dialog" aria-label="Race results">
          <div className="race-results-card">
            <p className="race-results-kicker">Final standings</p>
            <h2 className="race-results-title">Leaderboard</h2>
            <p className="race-results-sub">{lapCount} laps</p>
            <ol className="race-results-list">
              {finishOrder.map((row, place) => {
                const marker =
                  RACER_MARKER_COLORS[row.index] ?? RACER_MARKER_COLORS[0]
                return (
                  <li
                    key={`${row.id}-${row.index}`}
                    className={place === 0 ? 'first' : undefined}
                    style={{ borderLeftColor: marker }}
                  >
                    <span className="race-results-place">P{place + 1}</span>
                    <span
                      className="race-results-dot"
                      style={{ background: marker }}
                      aria-hidden
                    />
                    <span className="race-results-name">
                      {VEHICLE_META[row.id].label}
                    </span>
                    <span className="race-results-time">
                      {fmtRace(row.timeMs)}
                    </span>
                  </li>
                )
              })}
            </ol>
            <button
              type="button"
              className="race-results-restart"
              onClick={() => setStep('draw')}
            >
              Start over
            </button>
          </div>
        </div>
      )}

      <CarEdgeHint active={!chaseCam && sceneReady && !raceComplete} />

      <div className="race-hud">
        <div className="hud-left">
          <p className="hud-brand">Circuit Sketch</p>
          <p className="hud-meta">
            Chase {chaseLabel}
            {chasePlace != null ? ` · P${chasePlace}` : ''}
            {design.reverseDirection ? ' · CCW' : ' · CW'}
            {` · ${lapCount} laps`}
            {design.midiEnabled !== false ? ' · MIDI on' : ' · MIDI off'}
            {chaseCam
              ? ` · Zoom ${chaseDistance.toFixed(0)}m · drag to peek`
              : ' · Orbit'}
            {showBeacons ? ' · markers on' : ' · markers off'}
          </p>
          <p className="hud-times">
            {lastLapMs !== null ? `Last ${fmt(lastLapMs)}` : 'Last —'}
            {' · '}
            {bestLapMs !== null ? `Best ${fmt(bestLapMs)}` : 'Best —'}
          </p>
          {sceneReady && (
            <div className="hud-grip" aria-label="Grip">
              {(board.length > 0 ? board : racers.map((id, index) => ({
                  index,
                  id,
                  grip: 'green' as GripLevel,
                }))).map((row) => {
                const showAll = racers.length <= 4
                if (!showAll && row.index !== chaseIndex) return null
                const marker =
                  RACER_MARKER_COLORS[row.index] ?? RACER_MARKER_COLORS[0]
                return (
                  <span
                    key={`grip-${row.index}`}
                    className={`hud-grip-pip grip-${row.grip}${
                      row.index === chaseIndex ? ' chase' : ''
                    }`}
                    title={`Racer ${row.index + 1} grip`}
                    style={{ boxShadow: `inset 0 0 0 1px ${marker}55` }}
                  />
                )
              })}
            </div>
          )}
          {board.length > 1 && (
            <ol className="hud-board">
              {board.map((row) => {
                const marker =
                  RACER_MARKER_COLORS[row.index] ?? RACER_MARKER_COLORS[0]
                const done = finishOrder.some((r) => r.index === row.index)
                const lapLabel = done
                  ? 'Done'
                  : `${Math.min(row.lap + 1, lapCount)}/${lapCount}`
                return (
                  <li
                    key={`${row.id}-${row.index}`}
                    className={
                      row.index === chaseIndex
                        ? 'hud-board-row active'
                        : 'hud-board-row'
                    }
                  >
                    <button
                      type="button"
                      className="hud-board-btn"
                      onClick={() => setChaseIndex(row.index)}
                      title={`Chase ${row.label}`}
                      style={{ borderLeftColor: marker }}
                    >
                      <span
                        className="hud-marker"
                        style={{ background: marker }}
                        aria-hidden
                      />
                      <span className="hud-place">P{row.place}</span>
                      <span className="hud-racer">{row.label}</span>
                      <span
                        className={`hud-grip-inline grip-${row.grip}`}
                        aria-hidden
                      />
                      <span className="hud-lap">{lapLabel}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
          {racers.length > 1 && board.length <= 1 && (
            <div className="hud-chase-picks">
              {racers.map((id, i) => (
                <button
                  key={`${id}-${i}`}
                  type="button"
                  className={`hud-chip ${i === chaseIndex ? 'active' : ''}`}
                  onClick={() => setChaseIndex(i)}
                  style={{
                    borderColor:
                      RACER_MARKER_COLORS[i] ?? RACER_MARKER_COLORS[0],
                  }}
                >
                  <span
                    className="hud-chip-dot"
                    style={{
                      background:
                        RACER_MARKER_COLORS[i] ?? RACER_MARKER_COLORS[0],
                    }}
                  />
                  {VEHICLE_META[id].label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="hud-right">
          <button
            type="button"
            className={`hud-btn ${midiOpen ? 'on' : ''}`}
            onClick={() => setMidiOpen((v) => !v)}
            title="MIDI knobs and race speeds"
          >
            MIDI / Speeds
          </button>
          <button
            type="button"
            className={`hud-btn ${showBeacons ? 'on' : ''}`}
            onClick={() => setShowBeacons((v) => !v)}
            title="Toggle racer markers"
          >
            {showBeacons ? 'Markers on' : 'Markers off'}
          </button>
          <button
            type="button"
            className="hud-btn"
            onClick={() => {
              setChaseCam((c) => !c)
              setChaseOrbit(0)
            }}
          >
            {chaseCam ? 'Orbit cam' : 'Chase cam'}
          </button>
          <button
            type="button"
            className="hud-btn primary"
            onClick={() => setStep('draw')}
          >
            Edit track
          </button>
        </div>
      </div>

      <MidiSettingsPanel
        open={midiOpen}
        onClose={() => setMidiOpen(false)}
        racers={racers}
      />
    </div>
  )
}
