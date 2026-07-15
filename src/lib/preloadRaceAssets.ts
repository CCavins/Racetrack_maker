import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { TextureLoader, SRGBColorSpace } from 'three'
import { useGLTF } from '@react-three/drei'
import {
  getRaceVehicles,
  type TrackDesign,
  type VehicleId,
  type StickerType,
} from '../types'

const BASE = import.meta.env.BASE_URL

export const VEHICLE_GLB_URLS: Partial<Record<VehicleId, string>> = {
  hovercar: `${BASE}assets/vehicles/hovercar.glb`,
  cruiser: `${BASE}assets/vehicles/cruiser.glb`,
  muscle: `${BASE}assets/vehicles/muscle.glb`,
  canyon: `${BASE}assets/vehicles/canyon.glb`,
  thunderbolt: `${BASE}assets/vehicles/thunderbolt.glb`,
  cheetah: `${BASE}assets/vehicles/cheetah.glb`,
  lct: `${BASE}assets/vehicles/lct.glb`,
  motorcycle: `${BASE}assets/vehicles/motorcycle.glb`,
  cb750: `${BASE}assets/vehicles/cb750.glb`,
  cyberbike: `${BASE}assets/vehicles/cyberbike.glb`,
  truck: `${BASE}assets/vehicles/truck.glb`,
  van: `${BASE}assets/vehicles/van.glb`,
  race: `${BASE}assets/vehicles/race.glb`,
  sedan: `${BASE}assets/vehicles/sedan.glb`,
  taxi: `${BASE}assets/vehicles/taxi.glb`,
  police: `${BASE}assets/vehicles/police.glb`,
  suv: `${BASE}assets/vehicles/suv.glb`,
  ambulance: `${BASE}assets/vehicles/ambulance.glb`,
  hatchback: `${BASE}assets/vehicles/hatchback.glb`,
  future: `${BASE}assets/vehicles/future.glb`,
}

export const PROP_GLB_URLS: Partial<Record<StickerType, string>> = {
  cone: `${BASE}assets/props/cone.glb`,
  barrier: `${BASE}assets/props/barrier.glb`,
  rock: `${BASE}assets/props/rock.glb`,
  tree: `${BASE}assets/props/tree.glb`,
  tires: `${BASE}assets/props/tires.glb`,
  billboard: `${BASE}assets/props/billboard.glb`,
}

/** Kenney kit vehicles reference a shared colormap beside the GLB */
const KENNEY_VEHICLES = new Set<VehicleId>([
  'race',
  'motorcycle',
  'truck',
  'van',
  'sedan',
  'taxi',
  'police',
  'suv',
  'ambulance',
  'hatchback',
  'future',
])

const gltfLoader = new GLTFLoader()
const textureLoader = new TextureLoader()
const gltfCache = new Map<string, Promise<unknown>>()
const texCache = new Map<string, Promise<unknown>>()

function loadGltf(url: string): Promise<unknown> {
  let p = gltfCache.get(url)
  if (!p) {
    p = new Promise((resolve, reject) => {
      // Warm drei / R3F useLoader cache as well
      try {
        useGLTF.preload(url)
      } catch {
        /* preload is best-effort outside Canvas */
      }
      gltfLoader.load(url, resolve, undefined, reject)
    }).catch((err) => {
      gltfCache.delete(url)
      throw err
    })
    gltfCache.set(url, p)
  }
  return p
}

function loadTexture(url: string): Promise<unknown> {
  let p = texCache.get(url)
  if (!p) {
    p = new Promise((resolve, reject) => {
      textureLoader.load(
        url,
        (tex) => {
          tex.colorSpace = SRGBColorSpace
          resolve(tex)
        },
        undefined,
        reject,
      )
    }).catch((err) => {
      texCache.delete(url)
      throw err
    })
    texCache.set(url, p)
  }
  return p
}

function loadImageDataUrl(dataUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load wrap image'))
    img.src = dataUrl
  })
}

/** Collect and fully load every GLB / texture the race scene will need. */
export async function preloadRaceAssets(
  design: TrackDesign,
  onProgress?: (label: string) => void,
): Promise<void> {
  const jobs: Promise<unknown>[] = []

  const racers = getRaceVehicles(design)
  let needKenneyTex = false
  for (const id of racers) {
    const url = VEHICLE_GLB_URLS[id]
    if (url) {
      onProgress?.(`Loading ${id}…`)
      jobs.push(loadGltf(url))
    }
    if (KENNEY_VEHICLES.has(id)) needKenneyTex = true
  }
  if (needKenneyTex) {
    jobs.push(loadTexture(`${BASE}assets/vehicles/Textures/colormap.png`))
  }

  const propTypes = new Set(
    design.stickers
      .map((s) => s.type)
      .filter((t): t is StickerType => Boolean(PROP_GLB_URLS[t])),
  )
  for (const type of propTypes) {
    const url = PROP_GLB_URLS[type]
    if (url) {
      onProgress?.(`Loading ${type}…`)
      jobs.push(loadGltf(url))
    }
  }

  if (design.vehicleLook === 'wrap' && design.vehicleWrap?.startsWith('data:')) {
    onProgress?.('Loading wrap…')
    jobs.push(loadImageDataUrl(design.vehicleWrap))
  }

  onProgress?.('Assembling scene…')
  const results = await Promise.allSettled(jobs)
  const failed = results.filter((r) => r.status === 'rejected')
  if (failed.length) {
    console.warn(
      '[preloadRaceAssets] some assets failed; race will use fallbacks',
      failed,
    )
  }
}
