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

export type VehicleId = 'sports' | 'motorcycle' | 'semi' | 'minivan'

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

export type TrackDesign = {
  path: Vec2[]
  stickers: Sticker[]
  vehicle: VehicleId | null
  closed: boolean
}

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
  sports: { label: 'Sports Car', speed: 0.12, color: '#e63946' },
  motorcycle: { label: 'Motorcycle', speed: 0.16, color: '#457b9d' },
  semi: { label: 'Semi Truck', speed: 0.07, color: '#2a9d8f' },
  minivan: { label: 'Minivan', speed: 0.09, color: '#e9c46a' },
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
