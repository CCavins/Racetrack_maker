import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { applyChaseCamera, chasePaneLayout } from './chaseCam'
import type { VehicleState } from './Vehicle'

type Props = {
  enabled: boolean
  stateRefs: React.MutableRefObject<VehicleState>[]
  count: number
  chaseDistance: number
  chaseOrbit: number
}

const _buf = new THREE.Vector2()

function restoreFullView(gl: THREE.WebGLRenderer) {
  // Viewport/scissor are in drawing-buffer pixels (CSS size × DPR).
  // Restoring with R3F `size` leaves most of the buffer stale — the frozen
  // split overlay after leaving Split mode.
  gl.getDrawingBufferSize(_buf)
  gl.setScissorTest(false)
  gl.setViewport(0, 0, _buf.x, _buf.y)
  gl.setScissor(0, 0, _buf.x, _buf.y)
  gl.autoClear = true
}

/**
 * One shared scene, N chase cameras via scissor viewports.
 * Takes over after R3F's default pass while enabled, and always restores
 * the full drawing-buffer viewport so Chase/Orbit can redraw the canvas.
 */
export function SplitChaseRig({
  enabled,
  stateRefs,
  count,
  chaseDistance,
  chaseOrbit,
}: Props) {
  const { gl, scene } = useThree()
  const cameras = useMemo(
    () =>
      Array.from({ length: 4 }, () => {
        const c = new THREE.PerspectiveCamera(50, 1, 0.1, 200)
        c.position.set(12, 14, 18)
        return c
      }),
    [],
  )
  const fallbackFwd = useRef(new THREE.Vector3(0, 0, 1))
  const wasEnabled = useRef(false)

  useLayoutEffect(() => {
    if (!enabled) {
      restoreFullView(gl)
    }
    return () => {
      restoreFullView(gl)
    }
  }, [enabled, gl])

  // Before R3F's default render: clear leftover scissor state from Split.
  useFrame(() => {
    if (!enabled && wasEnabled.current) {
      restoreFullView(gl)
      wasEnabled.current = false
    }
  }, -1)

  useFrame((_, delta) => {
    if (!enabled || count < 1) return

    wasEnabled.current = true
    gl.getDrawingBufferSize(_buf)
    const bw = _buf.x
    const bh = _buf.y
    const panes = chasePaneLayout(count, bw, bh)

    gl.autoClear = false
    gl.setScissorTest(true)
    gl.setViewport(0, 0, bw, bh)
    gl.setScissor(0, 0, bw, bh)
    gl.clear(true, true, true)

    for (let i = 0; i < panes.length; i++) {
      const pane = panes[i]
      const cam = cameras[i]
      const st = stateRefs[i]?.current
      if (!st) continue

      cam.aspect = Math.max(pane.width, 1) / Math.max(pane.height, 1)
      cam.updateProjectionMatrix()

      const fwd =
        st.forward && st.forward.lengthSq() > 1e-8
          ? st.forward
          : fallbackFwd.current
      applyChaseCamera(
        cam,
        st.position,
        fwd,
        chaseDistance,
        chaseOrbit,
        delta,
      )

      gl.setViewport(pane.glX, pane.glY, pane.width, pane.height)
      gl.setScissor(pane.glX, pane.glY, pane.width, pane.height)
      gl.render(scene, cam)
    }

    restoreFullView(gl)
  }, 1)

  return null
}
