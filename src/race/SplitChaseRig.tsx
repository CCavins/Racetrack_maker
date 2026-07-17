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

const _size = new THREE.Vector2()

/**
 * Three.js setViewport/setScissor take *logical* (CSS) pixels and multiply
 * by the renderer pixel ratio internally. Do not pass drawing-buffer size.
 */
function restoreFullView(gl: THREE.WebGLRenderer) {
  gl.getSize(_size)
  gl.setScissorTest(false)
  gl.setViewport(0, 0, _size.x, _size.y)
  gl.setScissor(0, 0, _size.x, _size.y)
  gl.autoClear = true
}

/**
 * One shared scene, N chase cameras via scissor viewports.
 * Renders after R3F's default pass so panes cover the full canvas.
 * Always restores full logical viewport afterward — otherwise Chase/Orbit
 * only redraws the last pane and the rest of the split frame freezes.
 */
export function SplitChaseRig({
  enabled,
  stateRefs,
  count,
  chaseDistance,
  chaseOrbit,
}: Props) {
  const { gl, scene, camera } = useThree()
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
    return () => {
      restoreFullView(gl)
      if (camera instanceof THREE.PerspectiveCamera) {
        gl.getSize(_size)
        camera.aspect = _size.x / Math.max(_size.y, 1)
        camera.updateProjectionMatrix()
      }
    }
  }, [gl, camera])

  // Before R3F's default render: clear leftover scissor state from Split.
  useFrame(() => {
    if (!enabled && wasEnabled.current) {
      restoreFullView(gl)
      if (camera instanceof THREE.PerspectiveCamera) {
        gl.getSize(_size)
        camera.aspect = _size.x / Math.max(_size.y, 1)
        camera.updateProjectionMatrix()
      }
      wasEnabled.current = false
    }
  }, -1)

  useFrame((_, delta) => {
    if (!enabled || count < 1) return

    wasEnabled.current = true
    gl.getSize(_size)
    const w = _size.x
    const h = _size.y
    const panes = chasePaneLayout(count, w, h)

    gl.autoClear = false
    gl.setScissorTest(true)
    gl.setViewport(0, 0, w, h)
    gl.setScissor(0, 0, w, h)
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
