import { useEffect, useRef } from 'react'
import type { MidiBinding } from './midiTypes'

type MidiHandlers = {
  /** Called for every Control Change. Return true if consumed (e.g. learn). */
  onControlChange: (msg: {
    channel: number
    cc: number
    value: number
  }) => boolean
  onReady: (deviceName: string | null) => void
  onError: (message: string) => void
}

/**
 * Attach Web MIDI listeners to all inputs. Handlers are kept in a ref so
 * the effect does not re-subscribe when React callbacks change.
 */
export function useWebMidi(handlers: MidiHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    let cancelled = false
    let access: MIDIAccess | null = null
    const cleanups: Array<() => void> = []

    const attachInput = (input: MIDIInput) => {
      const onMessage = (event: MIDIMessageEvent) => {
        const data = event.data
        if (!data || data.length < 3) return
        const status = data[0]
        const type = status & 0xf0
        if (type !== 0xb0) return // Control Change only
        const channel = (status & 0x0f) + 1
        const cc = data[1]
        const value = data[2]
        handlersRef.current.onControlChange({ channel, cc, value })
      }
      input.addEventListener('midimessage', onMessage)
      cleanups.push(() => input.removeEventListener('midimessage', onMessage))
    }

    const refreshInputs = (acc: MIDIAccess) => {
      for (const c of cleanups.splice(0)) c()
      const inputs = [...acc.inputs.values()]
      for (const input of inputs) attachInput(input)
      const name =
        inputs.map((i) => i.name).filter(Boolean).join(', ') || null
      handlersRef.current.onReady(name)
    }

    async function connect() {
      if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
        handlersRef.current.onError(
          'Web MIDI is not supported in this browser',
        )
        return
      }
      try {
        access = await navigator.requestMIDIAccess({ sysex: false })
        if (cancelled) return
        refreshInputs(access)
        access.onstatechange = () => {
          if (access && !cancelled) refreshInputs(access)
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'MIDI permission denied'
        handlersRef.current.onError(msg)
      }
    }

    void connect()

    return () => {
      cancelled = true
      for (const c of cleanups) c()
      if (access) access.onstatechange = null
    }
  }, [])
}

/** Find which slot (if any) matches this CC message */
export function findSlotForCc(
  bindings: MidiBinding[],
  channel: number,
  cc: number,
): number {
  return bindings.findIndex((b) => b.channel === channel && b.cc === cc)
}
