export type Vec2 = { x: number; y: number }

export type StickerType =
  | 'jump'
  | 'cone'
  | 'barrier'
  | 'oil'
  | 'boost'
  | 'rock'
  | 'tree'
  | 'tires'
  | 'billboard'
  | 'water'

export type VehicleId =
  | 'hovercar'
  | 'cruiser'
  | 'muscle'
  | 'canyon'
  | 'thunderbolt'
  | 'cheetah'
  | 'lct'
  | 'motorcycle'
  | 'truck'
  | 'van'
  | 'race'
  | 'sedan'
  | 'taxi'
  | 'police'
  | 'suv'
  | 'ambulance'
  | 'hatchback'
  | 'future'

/** Old Higgsfield ids → current Kenney replacements (saved tracks / imports) */
export const LEGACY_VEHICLE_MAP: Record<string, VehicleId> = {
  sports: 'race',
  semi: 'truck',
  minivan: 'van',
}

export type Sticker = {
  id: string
  type: StickerType
  x: number
  y: number
  rotation: number
  scale: number
  /** Normalized 0–1 position along the closed track (snap stickers only) */
  pathT?: number
}

export type VehicleLookMode = 'stock' | 'paint' | 'wrap'

/** Max racers on track at once */
export const MAX_RACERS = 4

export type TrackDesign = {
  path: Vec2[]
  stickers: Sticker[]
  /**
   * Lineup for the race (1–4). Prefer this over singular `vehicle`.
   * Cosmetics (look/color/wrap) apply to the focused `vehicle`.
   */
  vehicles: VehicleId[]
  /** Focused vehicle for paint/wrap UI (also first racer if alone) */
  vehicle: VehicleId | null
  /** Which look is active in the race for the focused vehicle */
  vehicleLook: VehicleLookMode
  /** Body paint hex (used when vehicleLook === 'paint') */
  vehicleColor: string | null
  /** PNG/JPEG data URL (used when vehicleLook === 'wrap') */
  vehicleWrap: string | null
  /** When true, race runs counter-clockwise (decreasing t) */
  reverseDirection: boolean
  closed: boolean
}

/** Resolve the race lineup from a design (supports legacy singular-only saves). */
export function getRaceVehicles(design: TrackDesign): VehicleId[] {
  if (design.vehicles?.length) {
    const uniq: VehicleId[] = []
    for (const id of design.vehicles) {
      if (!uniq.includes(id)) uniq.push(id)
      if (uniq.length >= MAX_RACERS) break
    }
    return uniq
  }
  return design.vehicle ? [design.vehicle] : []
}

/** Preset swatches for the vehicle paint picker */
export const VEHICLE_PAINT_SWATCHES = [
  '#e63946',
  '#1a9fff',
  '#2a9d8f',
  '#e9c46a',
  '#f4f0e8',
  '#1a1a1a',
  '#7b2cbf',
  '#f07316',
] as const

export type AppStep = 'draw' | 'generating' | 'race'

export type EditorTool = 'reshape' | 'sticker' | 'select'

export const STICKER_META: Record<
  StickerType,
  { label: string; emoji: string; color: string }
> = {
  jump: { label: 'Jump', emoji: 'ramp', color: '#c45c26' },
  cone: { label: 'Cone', emoji: 'cone', color: '#f07316' },
  barrier: { label: 'Barrier', emoji: 'barrier', color: '#e8b923' },
  oil: { label: 'Oil', emoji: 'oil', color: '#2a2a2a' },
  boost: { label: 'Boost', emoji: 'boost', color: '#1a9fff' },
  rock: { label: 'Rock', emoji: 'rock', color: '#6b6b6b' },
  tree: { label: 'Tree', emoji: 'tree', color: '#2d6a3e' },
  tires: { label: 'Tires', emoji: 'tires', color: '#1a1a1a' },
  billboard: { label: 'Billboard', emoji: 'sign', color: '#e84d4d' },
  water: { label: 'Water', emoji: 'water', color: '#3a8fd4' },
}

export const VEHICLE_META: Record<
  VehicleId,
  { label: string; speed: number; color: string }
> = {
  hovercar: { label: 'Hovercar', speed: 0.14, color: '#90e0ef' },
  cruiser: { label: 'Cop Cruiser', speed: 0.11, color: '#1d3557' },
  muscle: { label: 'Muscle Car', speed: 0.13, color: '#e85d04' },
  canyon: { label: 'Canyon Custom', speed: 0.12, color: '#bc6c25' },
  thunderbolt: { label: 'Thunderbolt', speed: 0.15, color: '#c1121f' },
  cheetah: { label: 'Cheetah', speed: 0.14, color: '#f4a261' },
  lct: { label: 'LCT Sports', speed: 0.15, color: '#2b2d42' },
  race: { label: 'Race Car', speed: 0.15, color: '#ef233c' },
  motorcycle: { label: 'Motorcycle', speed: 0.16, color: '#457b9d' },
  truck: { label: 'Pickup Truck', speed: 0.08, color: '#2a9d8f' },
  van: { label: 'Van', speed: 0.09, color: '#e9c46a' },
  sedan: { label: 'Sedan', speed: 0.11, color: '#4cc9f0' },
  taxi: { label: 'Taxi', speed: 0.1, color: '#ffd60a' },
  police: { label: 'Police', speed: 0.13, color: '#118ab2' },
  suv: { label: 'SUV', speed: 0.1, color: '#6d597a' },
  ambulance: { label: 'Ambulance', speed: 0.09, color: '#f8f9fa' },
  hatchback: { label: 'Hatchback', speed: 0.12, color: '#06d6a0' },
  future: { label: 'Future Racer', speed: 0.14, color: '#7b2cbf' },
}

export const STICKER_TYPES = Object.keys(STICKER_META) as StickerType[]
export const VEHICLE_IDS = Object.keys(VEHICLE_META) as VehicleId[]

/** Snap to the course when placing / dragging */
export const SNAP_TO_TRACK_TYPES: StickerType[] = [
  'jump',
  'barrier',
  'cone',
  'boost',
]

/** Drawn as a band on the asphalt in the editor */
export const TRACK_BAND_TYPES: StickerType[] = ['jump', 'boost']

/** Solid props the car tries to avoid / can collide with */
export const COLLIDABLE_TYPES: StickerType[] = [
  'cone',
  'barrier',
  'rock',
  'tires',
  'tree',
  'billboard',
]

export function snapsToTrack(type: StickerType): boolean {
  return SNAP_TO_TRACK_TYPES.includes(type)
}

export function isTrackBand(type: StickerType): boolean {
  return TRACK_BAND_TYPES.includes(type)
}

export function isCollidable(type: StickerType): boolean {
  return COLLIDABLE_TYPES.includes(type)
}
