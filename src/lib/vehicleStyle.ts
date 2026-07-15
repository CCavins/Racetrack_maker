import * as THREE from 'three'

/** Mesh / material name patterns that must never receive paint or wrap */
const SKIP_NAME =
  /wheel|tire|tyre|rim|caliper|glass|window|windshield|light|lamp|interior|steer|seat|badge|plate|numberplate|fork|suspension|bottom|trim|chrome|mirror|exhaust|spoke|hub|rotor|disc|brake/i

/** Prefer painting these when present (Kenney body, Sketchfab Bodymat, etc.) */
const BODY_NAME =
  /^(body)$|bodymat|hood|trunk|door|fender|bumper(?!.*inner)|spoiler|chassis|cabin|hull/i

function collectNames(obj: THREE.Object3D, mat?: THREE.Material): string {
  const parts: string[] = []
  let n: THREE.Object3D | null = obj
  while (n) {
    if (n.name) parts.push(n.name)
    n = n.parent
  }
  if (mat?.name) parts.push(mat.name)
  return parts.join(' ')
}

/** True if this mesh/material should not be painted or wrapped */
export function isNonBodyPart(obj: THREE.Object3D, mat?: THREE.Material): boolean {
  const names = collectNames(obj, mat)
  if (SKIP_NAME.test(names)) return true
  return false
}

/** True if this looks like a primary body panel */
export function isBodyPart(obj: THREE.Object3D, mat?: THREE.Material): boolean {
  if (isNonBodyPart(obj, mat)) return false
  const names = collectNames(obj, mat)
  if (BODY_NAME.test(names)) return true
  // Sketchfab / misc: Material.001 often body; Plane_0 often glass/deck
  if (/material\.00[1-9]/i.test(names) && !/light/i.test(names)) return true
  return false
}

/**
 * Decide whether a mesh should receive paint/wrap.
 * If the model has any explicit body meshes, only those are painted.
 * Otherwise fall back to “everything that isn’t skipped”.
 */
function shouldPaintMesh(
  mesh: THREE.Mesh,
  mat: THREE.Material,
  hasExplicitBody: boolean,
): boolean {
  if (isNonBodyPart(mesh, mat)) return false
  if (hasExplicitBody) return isBodyPart(mesh, mat)
  return true
}

function sceneHasExplicitBody(root: THREE.Object3D): boolean {
  let found = false
  root.traverse((obj) => {
    if (found) return
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      if (isBodyPart(mesh, m)) {
        found = true
        return
      }
    }
  })
  return found
}

/** Color-only heuristic (legacy) — used only when names are missing */
export function isTrimMaterial(mat: THREE.Material): boolean {
  const std = mat as THREE.MeshStandardMaterial
  if (!std.color) return true
  const { r, g, b } = std.color
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (luma < 0.12) return true
  if (std.transparent && (std.opacity ?? 1) < 0.85) return true
  if ((std.metalness ?? 0) > 0.85 && luma < 0.35) return true
  return false
}

/**
 * Remap UVs so the wrap canvas covers the body by length × height.
 * Higgsfield / atlas meshes often have tiny UV islands — this makes the drawing readable.
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
  const hasExplicitBody = sceneHasExplicitBody(root)

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const anyPaintable = mats.some((m) =>
      shouldPaintMesh(mesh, m, hasExplicitBody),
    )
    if (!anyPaintable) return

    if (wrapMap && mesh.geometry) {
      mesh.geometry = mesh.geometry.clone()
      applyBodyWrapUVs(mesh.geometry)
    }

    const next = mats.map((m) => {
      if (!shouldPaintMesh(mesh, m, hasExplicitBody)) return m

      // Nameless materials: still skip obvious glass / dark trim by color
      if (!m.name && isTrimMaterial(m)) return m

      const cloned = m.clone()
      if (
        cloned instanceof THREE.MeshStandardMaterial ||
        cloned instanceof THREE.MeshPhysicalMaterial
      ) {
        if (wrapMap) {
          cloned.map = wrapMap
          cloned.color.set('#ffffff')
          cloned.metalness = Math.min(cloned.metalness ?? 0.3, 0.25)
          cloned.roughness = Math.max(cloned.roughness ?? 0.5, 0.55)
          cloned.envMapIntensity = 0.6
          cloned.needsUpdate = true
        } else {
          // Keep atlas textures (Kenney colormap) so windows/lights in the
          // body UV sheet stay readable — tint via color multiply.
          if (cloned.map) {
            cloned.color.copy(paint)
          } else {
            cloned.color.copy(paint)
          }
          cloned.needsUpdate = true
        }
      }
      return cloned
    })
    mesh.material = Array.isArray(mesh.material) ? next : next[0]
  })
}
