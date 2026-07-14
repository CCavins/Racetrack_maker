import type { Sticker, Vec2 } from '../types'
import { snapsToTrack } from '../types'

/** Euclidean distance between two points */
export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

/** Closed circle of control points centered in a canvas */
export function createCirclePath(
  width: number,
  height: number,
  count = 12,
  radiusRatio = 0.32,
): Vec2[] {
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * radiusRatio
  const points: Vec2[] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2
    points.push({
      x: cx + Math.cos(a) * radius,
      y: cy + Math.sin(a) * radius,
    })
  }
  return points
}

/** One Chaikin corner-cutting pass (closed) */
function chaikinPass(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points.slice()
  const out: Vec2[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const p0 = points[i]
    const p1 = points[(i + 1) % n]
    out.push({
      x: 0.75 * p0.x + 0.25 * p1.x,
      y: 0.75 * p0.y + 0.25 * p1.y,
    })
    out.push({
      x: 0.25 * p0.x + 0.75 * p1.x,
      y: 0.25 * p0.y + 0.75 * p1.y,
    })
  }
  return out
}

/** Smooth a closed control-point loop for canvas preview */
export function smoothClosedPath(points: Vec2[], iterations = 3): Vec2[] {
  if (points.length < 3) return points.slice()
  let result = points.slice()
  for (let i = 0; i < iterations; i++) {
    result = chaikinPass(result)
  }
  return result
}

/** Nearest control-point index within threshold, or -1 */
export function hitTestPoint(
  points: Vec2[],
  pos: Vec2,
  threshold: number,
): number {
  let best = -1
  let bestD = threshold
  for (let i = 0; i < points.length; i++) {
    const d = dist(points[i], pos)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/**
 * Find the segment nearest to `pos` on a closed loop.
 * Returns the index of the segment start (insert after this index).
 */
export function nearestSegment(
  points: Vec2[],
  pos: Vec2,
): { index: number; distance: number; closest: Vec2 } {
  let bestI = 0
  let bestD = Infinity
  let bestPt: Vec2 = points[0]
  const n = points.length
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby || 1
    let t = ((pos.x - a.x) * abx + (pos.y - a.y) * aby) / len2
    t = Math.max(0, Math.min(1, t))
    const closest = { x: a.x + abx * t, y: a.y + aby * t }
    const d = dist(pos, closest)
    if (d < bestD) {
      bestD = d
      bestI = i
      bestPt = closest
    }
  }
  return { index: bestI, distance: bestD, closest: bestPt }
}

/**
 * Snap a cursor position to the nearest point on the smoothed closed track.
 * `angle` is the tangent direction in canvas radians (for aligning bands).
 * `t` is arc-length parameter in [0, 1).
 */
export function snapToClosedPath(
  controls: Vec2[],
  pos: Vec2,
): { point: Vec2; angle: number; distance: number; t: number } {
  if (controls.length < 3) {
    return { point: pos, angle: 0, distance: Infinity, t: 0 }
  }
  const road = smoothClosedPath(controls, 3)
  const n = road.length
  let bestI = 0
  let bestD = Infinity
  let bestPt: Vec2 = road[0]
  let bestTSeg = 0
  const segLens: number[] = []
  let total = 0
  for (let i = 0; i < n; i++) {
    const a = road[i]
    const b = road[(i + 1) % n]
    const len = dist(a, b)
    segLens.push(len)
    total += len
  }
  for (let i = 0; i < n; i++) {
    const a = road[i]
    const b = road[(i + 1) % n]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby || 1
    let u = ((pos.x - a.x) * abx + (pos.y - a.y) * aby) / len2
    u = Math.max(0, Math.min(1, u))
    const closest = { x: a.x + abx * u, y: a.y + aby * u }
    const d = dist(pos, closest)
    if (d < bestD) {
      bestD = d
      bestI = i
      bestPt = closest
      bestTSeg = u
    }
  }
  // recompute arc t for best segment
  let before = 0
  for (let i = 0; i < bestI; i++) before += segLens[i]
  const t =
    total > 0 ? (before + segLens[bestI] * bestTSeg) / total : 0
  const a = road[bestI]
  const b = road[(bestI + 1) % n]
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  return { point: bestPt, angle, distance: bestD, t: t % 1 }
}

/** Sample the smoothed closed path at normalized arc-length t ∈ [0, 1) */
export function sampleClosedPath(
  controls: Vec2[],
  t: number,
): { point: Vec2; angle: number } {
  if (controls.length < 3) {
    return { point: controls[0] ?? { x: 0, y: 0 }, angle: 0 }
  }
  const road = smoothClosedPath(controls, 3)
  const n = road.length
  const segLens: number[] = []
  let total = 0
  for (let i = 0; i < n; i++) {
    const len = dist(road[i], road[(i + 1) % n])
    segLens.push(len)
    total += len
  }
  if (total <= 0) {
    return { point: road[0], angle: 0 }
  }
  let target = (((t % 1) + 1) % 1) * total
  for (let i = 0; i < n; i++) {
    const len = segLens[i]
    if (target <= len || i === n - 1) {
      const u = len > 0 ? target / len : 0
      const a = road[i]
      const b = road[(i + 1) % n]
      return {
        point: {
          x: a.x + (b.x - a.x) * u,
          y: a.y + (b.y - a.y) * u,
        },
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      }
    }
    target -= len
  }
  return { point: road[0], angle: 0 }
}

/** Re-attach all snap stickers to the current path using stored pathT */
export function resnapStickersToPath(
  path: Vec2[],
  stickers: Sticker[],
): Sticker[] {
  return stickers.map((s) => {
    if (!snapsToTrack(s.type)) return s
    const t = s.pathT ?? snapToClosedPath(path, { x: s.x, y: s.y }).t
    const { point, angle } = sampleClosedPath(path, t)
    return {
      ...s,
      x: point.x,
      y: point.y,
      rotation: angle,
      pathT: t,
    }
  })
}
