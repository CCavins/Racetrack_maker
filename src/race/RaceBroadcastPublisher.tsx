import { useEffect, useRef } from 'react'
import type { VehicleState } from './Vehicle'
import { VEHICLE_META, type VehicleId } from '../types'
import {
  MARKER_COLORS,
  RACE_POSE_CHANNEL,
  bridgeToSnapshot,
  createRacePoseBridge,
  writeRacePoseBridge,
} from './racePoseBridge'

type BoardPlace = { index: number; place: number }

type Props = {
  stateRefs: React.MutableRefObject<VehicleState>[]
  racers: VehicleId[]
  board: BoardPlace[]
  racing: boolean
  countdown: number | 'go' | null
  lapCount: number
  active: boolean
}

/** Invalidate orphaned rAF loops from Strict Mode / HMR remounts. */
let publishGeneration = 0

/**
 * Publishes live poses over BroadcastChannel (~30 Hz).
 * Map window keeps its own Float64Array — no cross-window shared buffers.
 */
export function RaceBroadcastPublisher({
  stateRefs,
  racers,
  board,
  racing,
  countdown,
  lapCount,
  active,
}: Props) {
  const boardRef = useRef(board)
  boardRef.current = board
  const racingRef = useRef(racing)
  racingRef.current = racing
  const countdownRef = useRef(countdown)
  countdownRef.current = countdown
  const lapCountRef = useRef(lapCount)
  lapCountRef.current = lapCount
  const racersKey = racers.join('|')

  useEffect(() => {
    if (!active) {
      if (window.__circuitSketchRace) delete window.__circuitSketchRace
      return
    }

    const gen = ++publishGeneration
    const session =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}`
    const bridge = createRacePoseBridge(session)
    window.__circuitSketchRace = bridge

    const ch =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(RACE_POSE_CHANNEL)
        : null
    let lastPost = 0
    let raf = 0

    const announce = (active: boolean) => {
      ch?.postMessage({ type: 'race-session', session, active })
    }

    const publish = (force = false) => {
      if (gen !== publishGeneration) return
      const places = new Array(racers.length).fill(0).map((_, i) => i + 1)
      for (const row of boardRef.current) {
        if (row.index >= 0 && row.index < places.length) {
          places[row.index] = row.place
        }
      }
      writeRacePoseBridge(bridge, stateRefs, {
        racing: racingRef.current,
        countdown: countdownRef.current,
        lapCount: lapCountRef.current,
        places,
        labels: racers.map((id) => VEHICLE_META[id]?.label ?? id),
        colors: racers.map((_, i) => MARKER_COLORS[i] ?? MARKER_COLORS[0]),
        vehicleIds: racers.map(String),
      })

      const snap = bridgeToSnapshot(bridge)
      if (!ch || !snap) return
      const now = performance.now()
      if (!force && now - lastPost < 33) return
      lastPost = now
      ch.postMessage(snap)
    }

    const tick = () => {
      if (gen !== publishGeneration) return
      publish(false)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onHello = (ev: MessageEvent) => {
      if (ev.data?.type === 'spectate-hello') {
        announce(true)
        publish(true)
      }
    }
    ch?.addEventListener('message', onHello)
    announce(true)
    publish(true)
    const t1 = window.setTimeout(() => publish(true), 250)

    return () => {
      publishGeneration++
      cancelAnimationFrame(raf)
      window.clearTimeout(t1)
      announce(false)
      ch?.removeEventListener('message', onHello)
      ch?.close()
      if (window.__circuitSketchRace === bridge) {
        delete window.__circuitSketchRace
      }
    }
  }, [active, racersKey, stateRefs, racers])

  return null
}
