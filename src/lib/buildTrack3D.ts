import * as THREE from 'three'
import { smoothClosedPath } from './pathSmooth'
import {
  isCollidable,
  snapsToTrack,
  type Sticker,
  type TrackDesign,
  type Vec2,
} from '../types'

export const ROAD_WIDTH = 4.2
export const WORLD_SCALE = 0.05 // canvas px → world units

export type DecalKind = 'oil' | 'water' | 'boost'

export type PropPlacement = {
  type: Sticker['type']
  position: THREE.Vector3
  rotation: number
  scale: number
}

export type DecalPlacement = {
  kind: DecalKind
  position: THREE.Vector3
  rotation: number
  scale: number
}

export type Obstacle = {
  type: Sticker['type']
  position: THREE.Vector3
  radius: number
  t: number
  /** Signed offset from centerline along track side (+ = left) */
  lateral: number
}

export type Track3D = {
  curve: THREE.CatmullRomCurve3
  roadPoints: THREE.Vector3[]
  jumps: { t: number; strength: number }[]
  props: PropPlacement[]
  decals: DecalPlacement[]
  obstacles: Obstacle[]
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  length: number
}

function canvasToWorld(p: Vec2, cx: number, cy: number): THREE.Vector3 {
  // Match canvas view looking down: +X right, +Z toward bottom of screen
  return new THREE.Vector3(
    (p.x - cx) * WORLD_SCALE,
    0,
    (p.y - cy) * WORLD_SCALE,
  )
}

/**
 * Arc-length curve through a closed polyline so the 3D road matches the
 * editor's Chaikin-smoothed stroke (not a second Catmull-Rom reshape).
 */
class ClosedPolylineCurve extends THREE.Curve<THREE.Vector3> {
  private pts: THREE.Vector3[]
  private cum: number[]
  private total: number

  constructor(points: THREE.Vector3[]) {
    super()
    this.pts = points
    this.cum = [0]
    let total = 0
    const n = points.length
    for (let i = 0; i < n; i++) {
      total += points[i].distanceTo(points[(i + 1) % n])
      this.cum.push(total)
    }
    this.total = total || 1
  }

  getPoint(t: number, optionalTarget = new THREE.Vector3()): THREE.Vector3 {
    const target = (((t % 1) + 1) % 1) * this.total
    const n = this.pts.length
    let i = 0
    while (i < n - 1 && this.cum[i + 1] < target) i++
    const a = this.pts[i]
    const b = this.pts[(i + 1) % n]
    const segStart = this.cum[i]
    const segLen = this.cum[i + 1] - segStart || 1
    const u = (target - segStart) / segLen
    return optionalTarget.copy(a).lerp(b, u)
  }

  getLength(): number {
    return this.total
  }
}

function nearestTOnCurve(
  getPointAt: (t: number) => THREE.Vector3,
  point: THREE.Vector3,
  samples = 256,
): number {
  let bestT = 0
  let bestD = Infinity
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const p = getPointAt(t)
    const d = p.distanceToSquared(point)
    if (d < bestD) {
      bestD = d
      bestT = t
    }
  }
  return bestT
}

function bumpHeight(
  t: number,
  t0: number,
  halfWidth: number,
  height: number,
): number {
  let dt = Math.abs(t - t0)
  if (dt > 0.5) dt = 1 - dt
  if (dt >= halfWidth) return 0
  const x = dt / halfWidth
  return height * (1 - x * x) * (1 - x * x)
}

function obstacleRadius(type: Sticker['type'], scale: number): number {
  switch (type) {
    case 'cone':
      return 0.55 * scale
    case 'barrier':
      return 1.1 * scale
    case 'rock':
      return 0.9 * scale
    case 'tires':
      return 0.85 * scale
    case 'tree':
      return 0.7 * scale
    case 'billboard':
      return 0.65 * scale
    default:
      return 0.7 * scale
  }
}

/** Light Laplacian smooth on a closed loop (XZ only; keep Y jumps) */
function smoothClosedRoadPoints(points: THREE.Vector3[], passes = 2): THREE.Vector3[] {
  let pts = points.map((p) => p.clone())
  const n = pts.length
  for (let pass = 0; pass < passes; pass++) {
    const next: THREE.Vector3[] = []
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n]
      const b = pts[i]
      const c = pts[(i + 1) % n]
      next.push(
        new THREE.Vector3(
          b.x * 0.5 + (a.x + c.x) * 0.25,
          b.y,
          b.z * 0.5 + (a.z + c.z) * 0.25,
        ),
      )
    }
    pts = next
  }
  return pts
}

/** Sample a polyline into a CatmullRomCurve3 for the rest of the app */
function toCatmullFromPolyline(
  poly: ClosedPolylineCurve,
  samples: number,
  elevate: (t: number, p: THREE.Vector3) => THREE.Vector3,
): { curve: THREE.CatmullRomCurve3; roadPoints: THREE.Vector3[] } {
  const raw: THREE.Vector3[] = []
  for (let i = 0; i < samples; i++) {
    const t = i / samples
    const p = poly.getPoint(t)
    raw.push(elevate(t, p))
  }
  const roadPoints = smoothClosedRoadPoints(raw, 2)
  // Dense, lightly smoothed samples → stable tangents for the car
  const curve = new THREE.CatmullRomCurve3(roadPoints, true, 'centripetal')
  return { curve, roadPoints }
}

export function buildTrack3D(design: TrackDesign): Track3D | null {
  if (!design.closed || design.path.length < 4) return null

  // Same Chaikin smoothing the editor paints — so race shape matches the sketch
  const smoothed = smoothClosedPath(design.path, 3)

  const xs = smoothed.map((p) => p.x)
  const ys = smoothed.map((p) => p.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2

  const flatPoints = smoothed.map((p) => canvasToWorld(p, cx, cy))
  const flatPoly = new ClosedPolylineCurve(flatPoints)
  const flatGet = (t: number) => flatPoly.getPoint(t)

  const jumps: { t: number; strength: number }[] = []
  for (const s of design.stickers) {
    if (s.type !== 'jump') continue
    const world = canvasToWorld({ x: s.x, y: s.y }, cx, cy)
    const t = nearestTOnCurve(flatGet, world)
    jumps.push({ t, strength: 2.8 * s.scale })
  }

  const SAMPLE = Math.max(160, flatPoints.length * 2)
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  const { curve, roadPoints } = toCatmullFromPolyline(
    flatPoly,
    SAMPLE,
    (t, p) => {
      let y = 0
      for (const j of jumps) {
        y += bumpHeight(t, j.t, 0.055, j.strength)
      }
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z)
      maxZ = Math.max(maxZ, p.z)
      return new THREE.Vector3(p.x, y, p.z)
    },
  )
  const length = curve.getLength()

  const props: PropPlacement[] = []
  const decals: DecalPlacement[] = []
  const obstacles: Obstacle[] = []

  for (const s of design.stickers) {
    const world = canvasToWorld({ x: s.x, y: s.y }, cx, cy)
    const t = nearestTOnCurve((u) => curve.getPointAt(u), world)
    const onRoad = curve.getPointAt(t)
    const tangent = curve.getTangentAt(t).normalize()
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
    const yaw = Math.atan2(tangent.x, tangent.z)

    const toObj = new THREE.Vector3(world.x - onRoad.x, 0, world.z - onRoad.z)
    const lateral = toObj.dot(side)

    if (s.type === 'jump') {
      continue
    }

    if (s.type === 'boost') {
      decals.push({
        kind: 'boost',
        position: new THREE.Vector3(onRoad.x, onRoad.y + 0.04, onRoad.z),
        rotation: yaw,
        scale: s.scale,
      })
      continue
    }

    if (s.type === 'oil' || s.type === 'water') {
      const groundY = onRoad.y + 0.04
      decals.push({
        kind: s.type,
        position: new THREE.Vector3(world.x, groundY, world.z),
        rotation: s.rotation,
        scale: s.scale,
      })
      continue
    }

    const snapped = snapsToTrack(s.type)
    const px = snapped ? onRoad.x : world.x
    const pz = snapped ? onRoad.z : world.z
    const py = onRoad.y
    const propPos = new THREE.Vector3(px, py, pz)

    props.push({
      type: s.type,
      position: propPos,
      rotation: snapped ? yaw : s.rotation,
      scale: s.scale,
    })

    if (isCollidable(s.type)) {
      const lat = snapped ? 0 : lateral
      obstacles.push({
        type: s.type,
        position: propPos.clone(),
        radius: obstacleRadius(s.type, s.scale),
        t,
        lateral: lat,
      })
    }
  }

  return {
    curve,
    roadPoints,
    jumps,
    props,
    decals,
    obstacles,
    bounds: { minX, maxX, minZ, maxZ },
    length,
  }
}

/** Build a ribbon BufferGeometry along the curve */
export function buildRoadGeometry(
  curve: THREE.CatmullRomCurve3,
  width = ROAD_WIDTH,
  segments = 256,
): THREE.BufferGeometry {
  const half = width / 2
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const p = curve.getPointAt(t)
    const tangent = curve.getTangentAt(t).normalize()
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
    const left = p.clone().addScaledVector(side, half)
    const right = p.clone().addScaledVector(side, -half)
    left.y = p.y
    right.y = p.y

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z)
    uvs.push(0, t * 20, 1, t * 20)

    if (i < segments) {
      const a = i * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      indices.push(a, b, c, b, d, c)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}
