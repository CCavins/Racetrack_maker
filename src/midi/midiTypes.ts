/** Web MIDI Control Change binding for one racer slot */
export type MidiBinding = {
  /** MIDI channel 1–16 */
  channel: number
  /** CC number 0–127 */
  cc: number
}

export const MIDI_SLOT_COUNT = 4

export const DEFAULT_MIDI_BINDINGS: MidiBinding[] = [
  { channel: 1, cc: 91 },
  { channel: 1, cc: 92 },
  { channel: 1, cc: 93 },
  { channel: 1, cc: 94 },
]

/** Default throw — survives mild bends, not hairpins */
export const DEFAULT_SPEED01 = 0.28

/** After a spin, must lift below this to regain power */
export const POWER_GATE_LIFT = 0.2

export const MIDI_STORAGE_KEY = 'circuit-sketch-midi-v1'

export type MidiPersisted = {
  bindings: MidiBinding[]
  speed01: number[]
}

/**
 * Map knob 0–1 → race base speed.
 * Wide range so straights reward full throw and corners demand backing off
 * (slot-car style).
 */
export function speed01ToBase(speed01: number): number {
  const t = THREE_clamp01(speed01)
  const eased = t * t * (3 - 2 * t)
  // crawl ≈ 0.02 · mid-throw ≈ 0.14 · max ≈ 0.42
  return 0.02 + eased * (0.42 - 0.02)
}

function THREE_clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

export function normalizeCc(value: number): number {
  return THREE_clamp01(value / 127)
}

export function formatBinding(b: MidiBinding): string {
  return `Ch${b.channel} CC${b.cc}`
}
