import { useEffect } from 'react'
import { useMidiControl } from '../midi/midiControlStore'
import { formatBinding, MIDI_SLOT_COUNT } from '../midi/midiTypes'
import { VEHICLE_META, type VehicleId } from '../types'

const SLOT_COLORS = ['#e8b923', '#1a9fff', '#ef233c', '#06d6a0'] as const

type Props = {
  open: boolean
  onClose: () => void
  racers: VehicleId[]
}

export function MidiSettingsPanel({ open, onClose, racers }: Props) {
  const {
    speed01,
    rawCc,
    bindings,
    learnSlot,
    deviceName,
    midiReady,
    midiError,
    setSpeed,
    startLearn,
    cancelLearn,
  } = useMidiControl()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Learning uses Esc to cancel map — don't also close the panel
      if (learnSlot !== null) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, learnSlot])

  if (!open) return null

  const statusLine = midiError
    ? midiError
    : midiReady && deviceName
      ? `MIDI: ${deviceName}`
      : midiReady
        ? 'MIDI ready — no device name'
        : 'Connecting MIDI…'

  return (
    <div
      className="midi-panel-backdrop"
      role="presentation"
      onClick={onClose}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="midi-panel"
        role="dialog"
        aria-label="MIDI and race speeds"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="midi-panel-head">
          <h2 className="midi-panel-title">MIDI / Speeds</h2>
          <button type="button" className="hud-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="midi-panel-status">{statusLine}</p>
        <p className="midi-panel-hint">
          Lift early for corners; ease back on after a spin. Esc cancels learn.
        </p>

        <ul className="midi-slot-list">
          {Array.from({ length: MIDI_SLOT_COUNT }, (_, slot) => {
            const id = racers[slot]
            const label = id
              ? VEHICLE_META[id].label
              : `Empty slot ${slot + 1}`
            const marker = SLOT_COLORS[slot] ?? SLOT_COLORS[0]
            const binding = bindings[slot]
            const pct = Math.round((speed01[slot] ?? 0) * 100)
            const raw = rawCc[slot]
            const learning = learnSlot === slot
            return (
              <li
                key={slot}
                className={`midi-slot ${learning ? 'learning' : ''}`}
                style={{ borderLeftColor: marker }}
              >
                <div className="midi-slot-top">
                  <span
                    className="midi-slot-dot"
                    style={{ background: marker }}
                    aria-hidden
                  />
                  <span className="midi-slot-name">
                    Racer {slot + 1}
                    {id ? ` · ${label}` : ''}
                  </span>
                  <span className="midi-slot-binding">
                    {binding ? formatBinding(binding) : '—'}
                    {raw != null ? ` · ${raw}` : ''}
                  </span>
                </div>
                <div className="midi-slot-controls">
                  <label className="midi-slider-label">
                    <span className="midi-pct">{pct}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={pct}
                      disabled={!id}
                      onChange={(e) =>
                        setSpeed(slot, Number(e.target.value) / 100)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={`hud-btn ${learning ? 'on' : ''}`}
                    onClick={() =>
                      learning ? cancelLearn() : startLearn(slot)
                    }
                  >
                    {learning ? 'Listening…' : 'Learn'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
