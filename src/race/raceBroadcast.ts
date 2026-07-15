import type { RacePoseBridge } from './racePoseBridge'

/** Open the angled course-map popup (same origin, `?spectate=1`). */
export function openSpectateWindow(): Window | null {
  const url = new URL(window.location.href)
  url.searchParams.set('spectate', '1')
  return window.open(
    url.toString(),
    'circuit-sketch-spectate',
    'popup=yes,width=1200,height=800',
  )
}

export function isSpectateMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('spectate')
  } catch {
    return false
  }
}

export type { RacePoseBridge }
