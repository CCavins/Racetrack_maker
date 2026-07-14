import { useMemo } from 'react'
import * as THREE from 'three'
import { buildRoadGeometry, type Track3D } from '../lib/buildTrack3D'

export function TrackMesh({ track }: { track: Track3D }) {
  const geometry = useMemo(
    () => buildRoadGeometry(track.curve, 4.2, 256),
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
    </group>
  )
}
