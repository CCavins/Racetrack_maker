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

/** Default mid-pack speed (0.5 → ~0.12 after ease) */
export const DEFAULT_SPEED01 = 0.5

export const MIDI_STORAGE_KEY = 'circuit-sketch-midi-v1'

export type MidiPersisted = {
  bindings: MidiBinding[]
  speed01: number[]
}

/** Map knob 0–1 → race base speed (crawl … mid … very fast) */
export function speed01ToBase(speed01: number): number {
  const t = THREE_clamp01(speed01)
  const eased = t * t * (3 - 2 * t) // smoothstep — usable mid throw
  return 0.03 + eased * (0.28 - 0.03)
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
