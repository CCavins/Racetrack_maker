import type { VehicleState } from './Vehicle'

export const MARKER_COLORS = ['#e8b923', '#1a9fff', '#ef233c', '#06d6a0'] as const

/** Bump when wire format / sync strategy changes (drops stale HMR publishers). */
export const RACE_POSE_CHANNEL = 'circuit-sketch-race-v2'

/** Per car: x y z qx qy qz qw lap place ready */
export const POSE_STRIDE = 10

export type RacePoseBridge = {
  session: string
  seq: number
  racing: boolean
  countdown: number | 'go' | null
  lapCount: number
  count: number
  data: Float64Array
  labels: string[]
  colors: string[]
  vehicleIds: string[]
}

declare global {
  interface Window {
    __circuitSketchRace?: RacePoseBridge
  }
}

export function createRacePoseBridge(session: string): RacePoseBridge {
  return {
    session,
    seq: 0,
    racing: false,
    countdown: null,
    lapCount: 3,
    count: 0,
    data: new Float64Array(4 * POSE_STRIDE),
    labels: ['', '', '', ''],
    colors: [...MARKER_COLORS],
    vehicleIds: ['', '', '', ''],
  }
}

/** Map window local buffer only — never share TypedArrays across windows. */
export function ensureLocalRacePoseBridge(): RacePoseBridge {
  const existing = window.__circuitSketchRace
  if (existing?.data && existing.data.length >= 4 * POSE_STRIDE) {
    return existing
  }
  const bridge = createRacePoseBridge('local')
  window.__circuitSketchRace = bridge
  return bridge
}

export function writeRacePoseBridge(
  bridge: RacePoseBridge,
  stateRefs: React.MutableRefObject<VehicleState>[],
  meta: {
    racing: boolean
    countdown: number | 'go' | null
    lapCount: number
    places: number[]
    labels: string[]
    colors: string[]
    vehicleIds: string[]
  },
) {
  bridge.racing = meta.racing
  bridge.countdown = meta.countdown
  bridge.lapCount = meta.lapCount
  const n = Math.min(4, stateRefs.length)
  bridge.count = n
  for (let i = 0; i < n; i++) {
    const s = stateRefs[i]?.current
    const o = i * POSE_STRIDE
    bridge.labels[i] = meta.labels[i] ?? ''
    bridge.colors[i] = meta.colors[i] ?? MARKER_COLORS[0]
    bridge.vehicleIds[i] = meta.vehicleIds[i] ?? ''
    if (!s?.poseReady) {
      if (bridge.data[o + 9] !== 1) {
        bridge.data[o + 9] = 0
      }
      continue
    }
    bridge.data[o + 0] = s.position.x
    bridge.data[o + 1] = s.position.y
    bridge.data[o + 2] = s.position.z
    bridge.data[o + 3] = s.quaternion.x
    bridge.data[o + 4] = s.quaternion.y
    bridge.data[o + 5] = s.quaternion.z
    bridge.data[o + 6] = s.quaternion.w
    bridge.data[o + 7] = s.lap
    bridge.data[o + 8] = meta.places[i] ?? i + 1
    bridge.data[o + 9] = 1
  }
  bridge.seq += 1
}

export function getRacePoseBridge(): RacePoseBridge | null {
  try {
    const local = window.__circuitSketchRace
    if (local?.data) return local
  } catch {
    /* ignore */
  }
  return null
}

export type RacePoseSnapshotCar = {
  index: number
  x: number
  y: number
  z: number
  qx: number
  qy: number
  qz: number
  qw: number
  lap: number
  place: number
  label: string
  color: string
  vehicleId: string
}

export type RacePoseSnapshot = {
  type: 'race-poses'
  session: string
  seq: number
  racing: boolean
  countdown: number | 'go' | null
  lapCount: number
  cars: RacePoseSnapshotCar[]
}

export function bridgeToSnapshot(bridge: RacePoseBridge): RacePoseSnapshot | null {
  const cars: RacePoseSnapshotCar[] = []
  for (let i = 0; i < bridge.count; i++) {
    const o = i * POSE_STRIDE
    if (!bridge.data[o + 9]) continue
    cars.push({
      index: i,
      x: bridge.data[o],
      y: bridge.data[o + 1],
      z: bridge.data[o + 2],
      qx: bridge.data[o + 3],
      qy: bridge.data[o + 4],
      qz: bridge.data[o + 5],
      qw: bridge.data[o + 6],
      lap: bridge.data[o + 7],
      place: bridge.data[o + 8],
      label: bridge.labels[i] ?? '',
      color: bridge.colors[i] ?? MARKER_COLORS[0],
      vehicleId: bridge.vehicleIds[i] ?? '',
    })
  }
  if (cars.length === 0) return null
  return {
    type: 'race-poses',
    session: bridge.session,
    seq: bridge.seq,
    racing: bridge.racing,
    countdown: bridge.countdown,
    lapCount: bridge.lapCount,
    cars,
  }
}

/**
 * Apply a snapshot only if it is newer than what we already have.
 * Returns false when the message is ignored (stale / other session).
 */
export function applyPoseSnapshot(
  bridge: RacePoseBridge,
  msg: RacePoseSnapshot,
): boolean {
  if (!msg.session || !Array.isArray(msg.cars) || msg.cars.length === 0) {
    return false
  }

  // Locked to first live session; ignore other race tabs / zombie publishers
  if (bridge.session !== 'local' && msg.session !== bridge.session) {
    return false
  }

  if (msg.session === bridge.session && msg.seq <= bridge.seq) {
    return false
  }

  bridge.session = msg.session
  bridge.seq = msg.seq
  bridge.racing = msg.racing
  bridge.countdown = msg.countdown
  bridge.lapCount = msg.lapCount
  for (const car of msg.cars) {
    const i = car.index
    if (i < 0 || i >= 4) continue
    bridge.count = Math.max(bridge.count, i + 1)
    const o = i * POSE_STRIDE
    bridge.data[o] = car.x
    bridge.data[o + 1] = car.y
    bridge.data[o + 2] = car.z
    bridge.data[o + 3] = car.qx
    bridge.data[o + 4] = car.qy
    bridge.data[o + 5] = car.qz
    bridge.data[o + 6] = car.qw
    bridge.data[o + 7] = car.lap
    bridge.data[o + 8] = car.place
    bridge.data[o + 9] = 1
    bridge.labels[i] = car.label || bridge.labels[i]
    bridge.colors[i] = car.color || bridge.colors[i]
    bridge.vehicleIds[i] = car.vehicleId || bridge.vehicleIds[i]
  }
  return true
}
