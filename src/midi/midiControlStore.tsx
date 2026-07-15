import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_MIDI_BINDINGS,
  DEFAULT_SPEED01,
  MIDI_SLOT_COUNT,
  MIDI_STORAGE_KEY,
  normalizeCc,
  type MidiBinding,
  type MidiPersisted,
} from './midiTypes'
import { findSlotForCc, useWebMidi } from './useWebMidi'

function loadPersisted(): MidiPersisted | null {
  try {
    const raw = localStorage.getItem(MIDI_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MidiPersisted
    if (
      !Array.isArray(parsed.bindings) ||
      parsed.bindings.length !== MIDI_SLOT_COUNT ||
      !Array.isArray(parsed.speed01) ||
      parsed.speed01.length !== MIDI_SLOT_COUNT
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

type MidiControlContextValue = {
  speed01: number[]
  /** Live raw CC 0–127 per slot (null if never received) */
  rawCc: (number | null)[]
  bindings: MidiBinding[]
  learnSlot: number | null
  deviceName: string | null
  midiReady: boolean
  midiError: string | null
  /** When false, ignore incoming CC (sliders still work) */
  midiListening: boolean
  setMidiListening: (on: boolean) => void
  /** Mutable refs for the race loop (no re-render per CC) */
  speed01Refs: React.MutableRefObject<number>[]
  setSpeed: (slot: number, value01: number) => void
  setBinding: (slot: number, binding: MidiBinding) => void
  startLearn: (slot: number) => void
  cancelLearn: () => void
}

const MidiControlContext = createContext<MidiControlContextValue | null>(null)

export function MidiControlProvider({ children }: { children: ReactNode }) {
  const persisted = useMemo(() => loadPersisted(), [])

  const [speed01, setSpeed01State] = useState<number[]>(
    () =>
      persisted?.speed01.map(clamp01) ??
      Array.from({ length: MIDI_SLOT_COUNT }, () => DEFAULT_SPEED01),
  )
  const [rawCc, setRawCc] = useState<(number | null)[]>(() =>
    Array.from({ length: MIDI_SLOT_COUNT }, () => null),
  )
  const [bindings, setBindings] = useState<MidiBinding[]>(
    () =>
      persisted?.bindings.map((b) => ({
        channel: Math.min(16, Math.max(1, b.channel | 0)),
        cc: Math.min(127, Math.max(0, b.cc | 0)),
      })) ?? DEFAULT_MIDI_BINDINGS.map((b) => ({ ...b })),
  )
  const [learnSlot, setLearnSlot] = useState<number | null>(null)
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [midiReady, setMidiReady] = useState(false)
  const [midiError, setMidiError] = useState<string | null>(null)
  const [midiListening, setMidiListening] = useState(true)
  const midiListeningRef = useRef(true)
  midiListeningRef.current = midiListening

  const speed01Refs = useMemo(
    () =>
      Array.from({ length: MIDI_SLOT_COUNT }, (_, i) => {
        const r = { current: speed01[i] ?? DEFAULT_SPEED01 }
        return r
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once
    [],
  )

  // Keep refs in sync when state changes from sliders
  useEffect(() => {
    for (let i = 0; i < MIDI_SLOT_COUNT; i++) {
      speed01Refs[i].current = speed01[i] ?? DEFAULT_SPEED01
    }
  }, [speed01, speed01Refs])

  const bindingsRef = useRef(bindings)
  bindingsRef.current = bindings
  const learnSlotRef = useRef(learnSlot)
  learnSlotRef.current = learnSlot

  const persist = useCallback((nextBindings: MidiBinding[], nextSpeed: number[]) => {
    try {
      const payload: MidiPersisted = {
        bindings: nextBindings,
        speed01: nextSpeed,
      }
      localStorage.setItem(MIDI_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      /* ignore quota */
    }
  }, [])

  const setSpeed = useCallback(
    (slot: number, value01: number) => {
      if (slot < 0 || slot >= MIDI_SLOT_COUNT) return
      const v = clamp01(value01)
      speed01Refs[slot].current = v
      setSpeed01State((prev) => {
        const next = [...prev]
        next[slot] = v
        persist(bindingsRef.current, next)
        return next
      })
    },
    [persist, speed01Refs],
  )

  const setBinding = useCallback(
    (slot: number, binding: MidiBinding) => {
      if (slot < 0 || slot >= MIDI_SLOT_COUNT) return
      setBindings((prev) => {
        const next = prev.map((b, i) =>
          i === slot ? { channel: binding.channel, cc: binding.cc } : b,
        )
        persist(next, speed01Refs.map((r) => r.current))
        return next
      })
    },
    [persist, speed01Refs],
  )

  const startLearn = useCallback((slot: number) => {
    if (slot < 0 || slot >= MIDI_SLOT_COUNT) return
    setLearnSlot(slot)
  }, [])

  const cancelLearn = useCallback(() => {
    setLearnSlot(null)
  }, [])

  // Esc cancels learn
  useEffect(() => {
    if (learnSlot === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLearnSlot(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [learnSlot])

  const setSpeedRef = useRef(setSpeed)
  setSpeedRef.current = setSpeed
  const setBindingRef = useRef(setBinding)
  setBindingRef.current = setBinding

  useWebMidi({
    onControlChange: ({ channel, cc, value }) => {
      const learning = learnSlotRef.current
      if (learning !== null) {
        setBindingRef.current(learning, { channel, cc })
        setLearnSlot(null)
        const v = normalizeCc(value)
        speed01Refs[learning].current = v
        setSpeed01State((prev) => {
          const next = [...prev]
          next[learning] = v
          persist(
            bindingsRef.current.map((b, i) =>
              i === learning ? { channel, cc } : b,
            ),
            next,
          )
          return next
        })
        setRawCc((prev) => {
          const next = [...prev]
          next[learning] = value
          return next
        })
        return true
      }

      if (!midiListeningRef.current) return false

      const slot = findSlotForCc(bindingsRef.current, channel, cc)
      if (slot < 0) return false
      const v = normalizeCc(value)
      speed01Refs[slot].current = v
      setSpeed01State((prev) => {
        if (Math.abs((prev[slot] ?? 0) - v) < 0.002) return prev
        const next = [...prev]
        next[slot] = v
        persist(bindingsRef.current, next)
        return next
      })
      setRawCc((prev) => {
        if (prev[slot] === value) return prev
        const next = [...prev]
        next[slot] = value
        return next
      })
      return true
    },
    onReady: (name) => {
      setDeviceName(name)
      setMidiReady(true)
      setMidiError(name ? null : 'No MIDI inputs found — use sliders')
    },
    onError: (message) => {
      setMidiReady(false)
      setMidiError(message)
      setDeviceName(null)
    },
  })

  const value = useMemo<MidiControlContextValue>(
    () => ({
      speed01,
      rawCc,
      bindings,
      learnSlot,
      deviceName,
      midiReady,
      midiError,
      midiListening,
      setMidiListening,
      speed01Refs,
      setSpeed,
      setBinding,
      startLearn,
      cancelLearn,
    }),
    [
      speed01,
      rawCc,
      bindings,
      learnSlot,
      deviceName,
      midiReady,
      midiError,
      midiListening,
      speed01Refs,
      setSpeed,
      setBinding,
      startLearn,
      cancelLearn,
    ],
  )

  return (
    <MidiControlContext.Provider value={value}>
      {children}
    </MidiControlContext.Provider>
  )
}

export function useMidiControl(): MidiControlContextValue {
  const ctx = useContext(MidiControlContext)
  if (!ctx) {
    throw new Error('useMidiControl must be used within MidiControlProvider')
  }
  return ctx
}
