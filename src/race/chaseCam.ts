import * as THREE from 'three'

const _back = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _camTarget = new THREE.Vector3()
const _look = new THREE.Vector3()

/**
 * Slot-car chase cam: behind the car, yawed by orbit, lerped toward target.
 */
export function applyChaseCamera(
  camera: THREE.Camera,
  carPos: THREE.Vector3,
  forward: THREE.Vector3,
  chaseDistance: number,
  chaseOrbit: number,
  delta: number,
): void {
  const dist = chaseDistance
  const height = Math.max(2.2, dist * 0.48)
  _back.copy(forward).multiplyScalar(-1)
  _back.applyAxisAngle(_up, chaseOrbit)
  _back.normalize()
  _camTarget.copy(carPos).addScaledVector(_back, dist)
  _camTarget.y += height

  const k = 1 - Math.pow(0.08, delta * 60)
  camera.position.lerp(_camTarget, k)

  const rearFactor = Math.max(0, Math.cos(chaseOrbit)) ** 2
  _look.copy(carPos)
  _look.y += 0.85
  _look.addScaledVector(forward, rearFactor * Math.min(2.2, dist * 0.18))
  camera.lookAt(_look)
}

export type PaneRect = {
  /** CSS / top-left origin */
  x: number
  y: number
  width: number
  height: number
  /** WebGL bottom-left origin for setViewport/setScissor */
  glX: number
  glY: number
}

/** Layout panes for 1–4 racers covering the full canvas */
export function chasePaneLayout(
  count: number,
  canvasW: number,
  canvasH: number,
): PaneRect[] {
  const n = Math.max(1, Math.min(4, count))
  const panes: PaneRect[] = []

  const push = (x: number, y: number, width: number, height: number) => {
    panes.push({
      x,
      y,
      width,
      height,
      glX: x,
      glY: canvasH - y - height,
    })
  }

  if (n === 1) {
    push(0, 0, canvasW, canvasH)
  } else if (n === 2) {
    const w = canvasW / 2
    push(0, 0, w, canvasH)
    push(w, 0, w, canvasH)
  } else if (n === 3) {
    const w = canvasW / 2
    const h = canvasH / 2
    push(0, 0, w, h)
    push(w, 0, w, h)
    push(0, h, canvasW, h)
  } else {
    const w = canvasW / 2
    const h = canvasH / 2
    push(0, 0, w, h)
    push(w, 0, w, h)
    push(0, h, w, h)
    push(w, h, w, h)
  }
  return panes
}
