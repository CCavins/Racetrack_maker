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

function restoreFullView(
  gl: THREE.WebGLRenderer,
  width: number,
  height: number,
) {
  gl.setScissorTest(false)
  gl.setViewport(0, 0, width, height)
  gl.setScissor(0, 0, width, height)
  gl.autoClear = true
}

/**
 * One shared scene, N chase cameras via scissor viewports.
 * Renders after R3F's default pass so panes cover the full canvas.
 * Always restores full viewport afterward — otherwise Chase/Orbit only
 * redraws the last pane and the rest of the split frame freezes on screen.
 */
export function SplitChaseRig({
  enabled,
  stateRefs,
  count,
  chaseDistance,
  chaseOrbit,
}: Props) {
  const { gl, scene, size } = useThree()
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
      restoreFullView(gl, size.width, size.height)
    }
  }, [enabled, gl, size.width, size.height])

  useFrame((_, delta) => {
    if (!enabled || count < 1) {
      if (wasEnabled.current) {
        restoreFullView(gl, size.width, size.height)
        wasEnabled.current = false
      }
      return
    }

    wasEnabled.current = true
    const panes = chasePaneLayout(count, size.width, size.height)
    gl.autoClear = false
    gl.setScissorTest(true)
    // Clear the whole canvas once, then draw each pane
    gl.setViewport(0, 0, size.width, size.height)
    gl.setScissor(0, 0, size.width, size.height)
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

    restoreFullView(gl, size.width, size.height)
  }, 1)

  return null
}
