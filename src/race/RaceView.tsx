import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Sky, ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { buildTrack3D } from '../lib/buildTrack3D'
import { useTrackStore } from '../state/trackStore'
import { VEHICLE_META } from '../types'
import { TrackMesh } from './TrackMesh'
import { PropInstances } from './PropInstances'
import { Vehicle, type VehicleState } from './Vehicle'
import './RaceView.css'

function SceneContent({
  chaseCam,
  chaseDistance,
  onLap,
  stateRef,
}: {
  chaseCam: boolean
  chaseDistance: number
  onLap: (n: number) => void
  stateRef: React.MutableRefObject<VehicleState>
}) {
  const { design } = useTrackStore()
  const track = useMemo(() => buildTrack3D(design), [design])

  if (!track || !design.vehicle) return null

  const pad = 18
  const { minX, maxX, minZ, maxZ } = track.bounds
  const groundSize = Math.max(maxX - minX, maxZ - minZ) + pad * 2

  return (
    <>
      <color attach="background" args={['#87a0b0']} />
      <fog attach="fog" args={['#9eb0bc', 40, 120]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#c8d8e8', '#4a5a40', 0.55]} />
      <directionalLight
        castShadow
        position={[30, 40, 20]}
        intensity={1.35}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={120}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
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
      <PropInstances props={track.props} decals={track.decals} />
      <Vehicle
        track={track}
        vehicleId={design.vehicle}
        chaseCam={chaseCam}
        chaseDistance={chaseDistance}
        showBeacon={!chaseCam}
        stateRef={stateRef}
        onLap={onLap}
      />

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.35}
        scale={groundSize}
        blur={2.5}
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

      {!chaseCam && <CarScreenProjector stateRef={stateRef} />}
    </>
  )
}

/** Projects car to NDC and writes into a DOM-readable ref via custom event bus */
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

    // heading from car toward screen center of view (for offscreen arrow)
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
          // place arrow on screen edge in direction of car
          const ux = Math.cos(ang)
          const uy = Math.sin(ang)
          // intersect with inset rectangle
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

export function RaceView() {
  const { design, setStep } = useTrackStore()
  const [chaseCam, setChaseCam] = useState(true)
  const [chaseDistance, setChaseDistance] = useState(8)
  const [lap, setLap] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<VehicleState>({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    t: 0,
    lap: 0,
  })
  const vehicleLabel = design.vehicle
    ? VEHICLE_META[design.vehicle].label
    : 'Vehicle'

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
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [chaseCam])

  return (
    <div className="race-view" ref={wrapRef}>
      <Canvas
        shadows
        camera={{ position: [12, 14, 18], fov: 50, near: 0.1, far: 200 }}
        dpr={[1, 1.75]}
      >
        <SceneContent
          chaseCam={chaseCam}
          chaseDistance={chaseDistance}
          onLap={setLap}
          stateRef={stateRef}
        />
      </Canvas>

      <CarEdgeHint active={!chaseCam} />

      <div className="race-hud">
        <div className="hud-left">
          <p className="hud-brand">Circuit Sketch</p>
          <p className="hud-meta">
            {vehicleLabel} · Lap {lap + 1}
            {chaseCam ? ` · Zoom ${chaseDistance.toFixed(0)}m` : ' · Orbit · yellow beacon = car'}
          </p>
        </div>
        <div className="hud-right">
          <button
            type="button"
            className="hud-btn"
            onClick={() => setChaseCam((c) => !c)}
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
    </div>
  )
}
