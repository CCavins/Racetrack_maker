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

/**
 * One shared scene, N chase cameras via scissor viewports.
 * Renders after R3F's default pass so panes cover the full canvas.
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

  useLayoutEffect(() => {
    if (!enabled) {
      gl.setScissorTest(false)
      gl.setViewport(0, 0, size.width, size.height)
    }
  }, [enabled, gl, size.width, size.height])

  useFrame((_, delta) => {
    if (!enabled || count < 1) return

    const panes = chasePaneLayout(count, size.width, size.height)
    gl.autoClear = false
    gl.clear(true, true, true)
    gl.setScissorTest(true)

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

    gl.setScissorTest(false)
    gl.autoClear = true
  }, 1)

  return null
}
