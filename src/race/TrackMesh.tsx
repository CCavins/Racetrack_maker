import { useMemo } from 'react'
import * as THREE from 'three'
import { buildRoadGeometry, ROAD_WIDTH, type Track3D } from '../lib/buildTrack3D'

export function TrackMesh({ track }: { track: Track3D }) {
  const geometry = useMemo(
    () => buildRoadGeometry(track.curve, ROAD_WIDTH, 256),
    [track],
  )

  const centerLine = useMemo(() => {
    const pts = track.curve.getPoints(200)
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({
      color: '#e8b923',
      transparent: true,
      opacity: 0.85,
    })
    const line = new THREE.Line(geo, mat)
    line.position.y = 0.04
    return line
  }, [track])

  const startPose = useMemo(() => {
    const p = track.curve.getPointAt(0)
    const tangent = track.curve.getTangentAt(0).normalize()
    const yaw = Math.atan2(tangent.x, tangent.z)
    return {
      position: [p.x, p.y + 0.055, p.z] as [number, number, number],
      yaw,
    }
  }, [track])

  return (
    <group>
      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial
          color="#1e1f22"
          roughness={0.88}
          metalness={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={geometry} position={[0, 0.02, 0]}>
        <meshBasicMaterial
          color="#2c2d30"
          transparent
          opacity={0.35}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <primitive object={centerLine} />
      {/* Start / finish stripe across the road at t = 0 */}
      <group position={startPose.position} rotation={[0, startPose.yaw, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[ROAD_WIDTH * 0.92, 0.42]} />
          <meshStandardMaterial
            color="#f5f5f5"
            emissive="#ffffff"
            emissiveIntensity={0.2}
            roughness={0.55}
            metalness={0.05}
            polygonOffset
            polygonOffsetFactor={-2}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  )
}
