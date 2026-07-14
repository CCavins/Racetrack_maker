import * as THREE from 'three'

/** True if this material looks like tires / dark trim (skip recolor) */
export function isTrimMaterial(mat: THREE.Material): boolean {
  const std = mat as THREE.MeshStandardMaterial
  if (!std.color) return true
  const { r, g, b } = std.color
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (luma < 0.12) return true
  // Glass-ish
  if (std.transparent && (std.opacity ?? 1) < 0.85) return true
  if ((std.metalness ?? 0) > 0.85 && luma < 0.35) return true
  return false
}

/**
 * Remap UVs so the wrap canvas covers the body by length × height.
 * Higgsfield meshes often have tiny UV islands — this makes the drawing readable.
 */
function applyBodyWrapUVs(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) return
  const size = new THREE.Vector3()
  box.getSize(size)
  const pos = geometry.attributes.position
  if (!pos) return

  const uvs = new Float32Array(pos.count * 2)
  // Prefer length (largest horizontal) × height for both flanks
  const useXForU = size.x >= size.z
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const u = useXForU
      ? (x - box.min.x) / (size.x || 1)
      : (z - box.min.z) / (size.z || 1)
    const v = (y - box.min.y) / (size.y || 1)
    uvs[i * 2] = u
    uvs[i * 2 + 1] = v
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
}

export function recolorBodyMaterials(
  root: THREE.Object3D,
  hex: string,
  wrapMap: THREE.Texture | null,
) {
  const paint = new THREE.Color(hex)
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return

    if (wrapMap && mesh.geometry) {
      // Clone geometry so we don't mutate the cached GLTF
      mesh.geometry = mesh.geometry.clone()
      applyBodyWrapUVs(mesh.geometry)
    }

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const next = mats.map((m) => {
      const cloned = m.clone()
      if (
        cloned instanceof THREE.MeshStandardMaterial ||
        cloned instanceof THREE.MeshPhysicalMaterial
      ) {
        if (!isTrimMaterial(cloned)) {
          if (wrapMap) {
            cloned.map = wrapMap
            cloned.color.set('#ffffff')
            cloned.metalness = Math.min(cloned.metalness ?? 0.3, 0.25)
            cloned.roughness = Math.max(cloned.roughness ?? 0.5, 0.55)
            cloned.envMapIntensity = 0.6
            cloned.needsUpdate = true
          } else {
            cloned.map = null
            cloned.color.copy(paint)
            cloned.needsUpdate = true
          }
        }
      }
      return cloned
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]
  })
}
