import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppStep,
  EditorTool,
  Sticker,
  StickerType,
  TrackDesign,
  VehicleId,
  VehicleLookMode,
  Vec2,
} from '../types'
import { STICKER_TYPES, VEHICLE_IDS } from '../types'
import { createCirclePath, resnapStickersToPath } from '../lib/pathSmooth'

const STORAGE_KEY = 'circuit-sketch-v1'
const WRAP_STORAGE_KEY = 'circuit-sketch-wrap-v1'

function loadStoredWrap(): string | null {
  try {
    const w = localStorage.getItem(WRAP_STORAGE_KEY)
    return w && w.startsWith('data:') ? w : null
  } catch {
    return null
  }
}

function saveStoredWrap(wrap: string | null) {
  try {
    if (!wrap) localStorage.removeItem(WRAP_STORAGE_KEY)
    else localStorage.setItem(WRAP_STORAGE_KEY, wrap)
  } catch {
    /* quota — keep in memory; race still works this session */
  }
}

type PersistedState = {
  design: TrackDesign
  step: AppStep
  stickerSeq: number
  canvasW?: number
  canvasH?: number
  bestLapMs?: number | null
}

type TrackStore = {
  step: AppStep
  setStep: (s: AppStep) => void
  design: TrackDesign
  canvasSize: { w: number; h: number } | null
  setCanvasSize: (w: number, h: number) => void
  setPath: (path: Vec2[]) => void
  updateControlPoint: (index: number, pos: Vec2) => void
  insertControlPoint: (afterIndex: number, pos: Vec2) => void
  removeControlPoint: (index: number) => void
  resetCircle: (width: number, height: number) => void
  scaleDesignToCanvas: (fromW: number, fromH: number, toW: number, toH: number) => void
  tool: EditorTool
  setTool: (t: EditorTool) => void
  pendingSticker: StickerType | null
  setPendingSticker: (t: StickerType | null) => void
  addSticker: (s: Omit<Sticker, 'id'>, opts?: { select?: boolean }) => void
  updateSticker: (id: string, patch: Partial<Sticker>) => void
  removeSticker: (id: string) => void
  selectedStickerId: string | null
  setSelectedStickerId: (id: string | null) => void
  selectedPointIndex: number | null
  setSelectedPointIndex: (i: number | null) => void
  setVehicle: (v: VehicleId) => void
  setVehicleLook: (look: import('../types').VehicleLookMode) => void
  setVehicleColor: (color: string | null) => void
  setVehicleWrap: (wrap: string | null) => void
  toggleReverseDirection: () => void
  exportDesignJson: () => string
  importDesignJson: (
    json: string,
    targetCanvas?: { w: number; h: number },
  ) => { ok: true } | { ok: false; error: string }
  bestLapMs: number | null
  recordLapTime: (ms: number) => void
  clearAll: (width?: number, height?: number) => void
  canGenerate: boolean
  loadStatus: string | null
  setLoadStatus: (s: string | null) => void
}

const Ctx = createContext<TrackStore | null>(null)

const MIN_POINTS = 4

const emptyDesign = (): TrackDesign => ({
  path: [],
  stickers: [],
  vehicle: null,
  vehicleLook: 'stock',
  vehicleColor: null,
  vehicleWrap: null,
  reverseDirection: false,
  closed: true,
})

let stickerSeq = 0

function withResnapped(path: Vec2[], stickers: Sticker[]): Sticker[] {
  return resnapStickersToPath(path, stickers)
}

function isVec2(v: unknown): v is Vec2 {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as Vec2).x === 'number' &&
    typeof (v as Vec2).y === 'number' &&
    Number.isFinite((v as Vec2).x) &&
    Number.isFinite((v as Vec2).y)
  )
}

function isStickerType(t: unknown): t is StickerType {
  return typeof t === 'string' && (STICKER_TYPES as string[]).includes(t)
}

function isVehicleId(v: unknown): v is VehicleId {
  return typeof v === 'string' && (VEHICLE_IDS as string[]).includes(v)
}

function parseSticker(raw: unknown, index: number): Sticker | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (!isStickerType(s.type) || !isVec2({ x: s.x, y: s.y })) return null
  const id =
    typeof s.id === 'string' && s.id.length > 0 ? s.id : `import-${index}`
  const rotation = typeof s.rotation === 'number' ? s.rotation : 0
  const scale =
    typeof s.scale === 'number' && s.scale > 0 ? s.scale : 1
  const pathT =
    typeof s.pathT === 'number' && Number.isFinite(s.pathT) ? s.pathT : undefined
  return {
    id,
    type: s.type,
    x: s.x as number,
    y: s.y as number,
    rotation,
    scale,
    ...(pathT !== undefined ? { pathT } : {}),
  }
}

function normalizeDesign(raw: Partial<TrackDesign>): TrackDesign {
  const look: VehicleLookMode =
    raw.vehicleLook === 'paint' ||
    raw.vehicleLook === 'wrap' ||
    raw.vehicleLook === 'stock'
      ? raw.vehicleLook
      : raw.vehicleWrap
        ? 'wrap'
        : raw.vehicleColor
          ? 'paint'
          : 'stock'
  return {
    ...emptyDesign(),
    ...raw,
    stickers: Array.isArray(raw.stickers) ? raw.stickers : [],
    path: Array.isArray(raw.path) ? raw.path : [],
    vehicleLook: look,
    vehicleColor: raw.vehicleColor ?? null,
    vehicleWrap: raw.vehicleWrap ?? null,
    reverseDirection: Boolean(raw.reverseDirection),
    closed: true,
  }
}

/** Parse export payload `{ version, design, canvasW?, canvasH? }` or a bare TrackDesign. */
function parseDesignJson(json: string):
  | {
      ok: true
      design: TrackDesign
      canvasW: number | null
      canvasH: number | null
    }
  | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: 'Not valid JSON' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Expected a JSON object' }
  }
  const root = parsed as Record<string, unknown>
  const rawDesign =
    root.design && typeof root.design === 'object'
      ? (root.design as Partial<TrackDesign>)
      : Array.isArray(root.path)
        ? (root as Partial<TrackDesign>)
        : null
  if (!rawDesign) {
    return { ok: false, error: 'Missing design.path' }
  }
  if (!Array.isArray(rawDesign.path) || rawDesign.path.length < MIN_POINTS) {
    return { ok: false, error: `Track needs at least ${MIN_POINTS} points` }
  }
  const path = rawDesign.path.filter(isVec2)
  if (path.length < MIN_POINTS) {
    return { ok: false, error: 'Path points must be { x, y } numbers' }
  }
  const stickers = Array.isArray(rawDesign.stickers)
    ? rawDesign.stickers
        .map(parseSticker)
        .filter((s): s is Sticker => s !== null)
    : []
  const vehicle =
    rawDesign.vehicle === null || rawDesign.vehicle === undefined
      ? null
      : isVehicleId(rawDesign.vehicle)
        ? rawDesign.vehicle
        : null
  const vehicleWrap =
    typeof rawDesign.vehicleWrap === 'string' &&
    rawDesign.vehicleWrap.startsWith('data:')
      ? rawDesign.vehicleWrap
      : null
  const vehicleColor =
    typeof rawDesign.vehicleColor === 'string' ? rawDesign.vehicleColor : null

  const canvasW =
    typeof root.canvasW === 'number' && root.canvasW > 2 ? root.canvasW : null
  const canvasH =
    typeof root.canvasH === 'number' && root.canvasH > 2 ? root.canvasH : null

  const design = normalizeDesign({
    ...rawDesign,
    path,
    stickers: withResnapped(path, stickers),
    vehicle,
    vehicleColor,
    vehicleWrap,
  })
  return { ok: true, design, canvasW, canvasH }
}

function mapDesignCoords(
  design: TrackDesign,
  map: (x: number, y: number) => Vec2,
): TrackDesign {
  const path = design.path.map((p) => map(p.x, p.y))
  const stickers = design.stickers.map((s) => {
    const p = map(s.x, s.y)
    return { ...s, x: p.x, y: p.y }
  })
  return {
    ...design,
    path,
    stickers: withResnapped(path, stickers),
  }
}

/** Scale from export canvas size, or fit bbox into the live canvas. */
function adaptDesignToCanvas(
  design: TrackDesign,
  toW: number,
  toH: number,
  fromW: number | null,
  fromH: number | null,
): TrackDesign {
  if (toW < 2 || toH < 2) return design

  if (fromW && fromH && fromW > 2 && fromH > 2) {
    const sx = toW / fromW
    const sy = toH / fromH
    if (Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001) return design
    return mapDesignCoords(design, (x, y) => ({ x: x * sx, y: y * sy }))
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of design.path) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  for (const s of design.stickers) {
    minX = Math.min(minX, s.x)
    minY = Math.min(minY, s.y)
    maxX = Math.max(maxX, s.x)
    maxY = Math.max(maxY, s.y)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return design

  const bw = Math.max(maxX - minX, 1)
  const bh = Math.max(maxY - minY, 1)
  const pad = 0.1
  const scale = Math.min((toW * (1 - 2 * pad)) / bw, (toH * (1 - 2 * pad)) / bh)
  const contentW = bw * scale
  const contentH = bh * scale
  const ox = (toW - contentW) / 2 - minX * scale
  const oy = (toH - contentH) / 2 - minY * scale
  return mapDesignCoords(design, (x, y) => ({
    x: x * scale + ox,
    y: y * scale + oy,
  }))
}

function loadPersisted(): {
  design: TrackDesign
  step: AppStep
  canvasSize: { w: number; h: number } | null
  bestLapMs: number | null
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as PersistedState
    if (!data?.design || !Array.isArray(data.design.path)) return null
    if (typeof data.stickerSeq === 'number' && data.stickerSeq > stickerSeq) {
      stickerSeq = data.stickerSeq
    }
    const step: AppStep =
      data.step === 'race' || data.step === 'draw' ? data.step : 'draw'
    const design = normalizeDesign(data.design)
    // Wrap lives in a separate key so quota failures don't wipe it
    if (!design.vehicleWrap) {
      design.vehicleWrap = loadStoredWrap()
      if (design.vehicleWrap && design.vehicleLook === 'stock') {
        design.vehicleLook = 'wrap'
      }
    } else {
      saveStoredWrap(design.vehicleWrap)
    }
    const restoredStep: AppStep =
      step === 'race' &&
      design.path.length >= 4 &&
      design.vehicle !== null
        ? 'race'
        : 'draw'
    const canvasSize =
      typeof data.canvasW === 'number' &&
      typeof data.canvasH === 'number' &&
      data.canvasW > 0 &&
      data.canvasH > 0
        ? { w: data.canvasW, h: data.canvasH }
        : null
    return {
      design,
      step: restoredStep,
      canvasSize,
      bestLapMs:
        typeof data.bestLapMs === 'number' && data.bestLapMs > 0
          ? data.bestLapMs
          : null,
    }
  } catch {
    return null
  }
}

function savePersisted(
  design: TrackDesign,
  step: AppStep,
  canvasSize: { w: number; h: number } | null,
  bestLapMs: number | null,
) {
  // Always keep wrap in its own key so the main blob stays small
  saveStoredWrap(design.vehicleWrap)
  try {
    const payload: PersistedState = {
      design: { ...design, vehicleWrap: null },
      step: step === 'generating' ? 'draw' : step,
      stickerSeq,
      canvasW: canvasSize?.w,
      canvasH: canvasSize?.h,
      bestLapMs,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    try {
      const payload: PersistedState = {
        design: {
          ...design,
          vehicleWrap: null,
          stickers: design.stickers.slice(0, 40),
        },
        step: step === 'generating' ? 'draw' : step,
        stickerSeq,
        canvasW: canvasSize?.w,
        canvasH: canvasSize?.h,
        bestLapMs,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      /* ignore */
    }
  }
}

export function TrackProvider({ children }: { children: ReactNode }) {
  const persisted = useMemo(() => loadPersisted(), [])
  const [step, setStep] = useState<AppStep>(persisted?.step ?? 'draw')
  const [design, setDesign] = useState<TrackDesign>(
    () => persisted?.design ?? emptyDesign(),
  )
  const [canvasSize, setCanvasSizeState] = useState<{ w: number; h: number } | null>(
    () => persisted?.canvasSize ?? null,
  )
  const [bestLapMs, setBestLapMs] = useState<number | null>(
    () => persisted?.bestLapMs ?? null,
  )
  const [tool, setTool] = useState<EditorTool>('reshape')
  const [pendingSticker, setPendingSticker] = useState<StickerType | null>(null)
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null)
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  )
  const [loadStatus, setLoadStatus] = useState<string | null>(null)

  useEffect(() => {
    savePersisted(design, step, canvasSize, bestLapMs)
  }, [design, step, canvasSize, bestLapMs])

  const setCanvasSize = useCallback((w: number, h: number) => {
    setCanvasSizeState((prev) =>
      prev && prev.w === w && prev.h === h ? prev : { w, h },
    )
  }, [])

  const setPath = useCallback((path: Vec2[]) => {
    setDesign((d) => ({
      ...d,
      path,
      closed: true,
      stickers: withResnapped(path, d.stickers),
    }))
  }, [])

  const updateControlPoint = useCallback((index: number, pos: Vec2) => {
    setDesign((d) => {
      if (index < 0 || index >= d.path.length) return d
      const path = d.path.slice()
      path[index] = { x: pos.x, y: pos.y }
      return {
        ...d,
        path,
        closed: true,
        stickers: withResnapped(path, d.stickers),
      }
    })
  }, [])

  const insertControlPoint = useCallback((afterIndex: number, pos: Vec2) => {
    setDesign((d) => {
      if (d.path.length < 3) return d
      const path = d.path.slice()
      path.splice(afterIndex + 1, 0, { x: pos.x, y: pos.y })
      return {
        ...d,
        path,
        closed: true,
        stickers: withResnapped(path, d.stickers),
      }
    })
    setSelectedPointIndex(afterIndex + 1)
    setSelectedStickerId(null)
  }, [])

  const removeControlPoint = useCallback((index: number) => {
    setDesign((d) => {
      if (d.path.length <= MIN_POINTS) return d
      if (index < 0 || index >= d.path.length) return d
      const path = d.path.filter((_, i) => i !== index)
      return {
        ...d,
        path,
        closed: true,
        stickers: withResnapped(path, d.stickers),
      }
    })
    setSelectedPointIndex(null)
  }, [])

  const resetCircle = useCallback((width: number, height: number) => {
    const path = createCirclePath(width, height)
    setDesign((d) => ({
      ...d,
      path,
      closed: true,
      stickers: withResnapped(path, d.stickers),
    }))
    setSelectedPointIndex(null)
  }, [])

  const scaleDesignToCanvas = useCallback(
    (fromW: number, fromH: number, toW: number, toH: number) => {
      if (fromW < 2 || fromH < 2 || toW < 2 || toH < 2) return
      if (fromW === toW && fromH === toH) return
      const sx = toW / fromW
      const sy = toH / fromH
      setDesign((d) => {
        if (d.path.length < 1) return d
        const path = d.path.map((p) => ({ x: p.x * sx, y: p.y * sy }))
        const stickers = d.stickers.map((s) => ({
          ...s,
          x: s.x * sx,
          y: s.y * sy,
        }))
        return {
          ...d,
          path,
          stickers: withResnapped(path, stickers),
          closed: true,
        }
      })
    },
    [],
  )

  const addSticker = useCallback(
    (s: Omit<Sticker, 'id'>, opts?: { select?: boolean }) => {
      const id = `stk-${++stickerSeq}`
      setDesign((d) => ({
        ...d,
        stickers: [...d.stickers, { ...s, id }],
      }))
      if (opts?.select) {
        setSelectedStickerId(id)
      }
      setSelectedPointIndex(null)
    },
    [],
  )

  const updateSticker = useCallback((id: string, patch: Partial<Sticker>) => {
    setDesign((d) => ({
      ...d,
      stickers: d.stickers.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  }, [])

  const removeSticker = useCallback((id: string) => {
    setDesign((d) => ({
      ...d,
      stickers: d.stickers.filter((s) => s.id !== id),
    }))
    setSelectedStickerId((cur) => (cur === id ? null : cur))
  }, [])

  const setVehicle = useCallback((v: VehicleId) => {
    setDesign((d) => ({ ...d, vehicle: v }))
  }, [])

  const setVehicleLook = useCallback((look: VehicleLookMode) => {
    setDesign((d) => ({ ...d, vehicleLook: look }))
  }, [])

  const setVehicleColor = useCallback((color: string | null) => {
    setDesign((d) => ({
      ...d,
      vehicleColor: color,
      vehicleLook: 'paint',
    }))
  }, [])

  const setVehicleWrap = useCallback((wrap: string | null) => {
    saveStoredWrap(wrap)
    setDesign((d) => ({
      ...d,
      vehicleWrap: wrap,
      vehicleLook: wrap
        ? 'wrap'
        : d.vehicleLook === 'wrap'
          ? 'stock'
          : d.vehicleLook,
    }))
  }, [])

  const toggleReverseDirection = useCallback(() => {
    setDesign((d) => ({ ...d, reverseDirection: !d.reverseDirection }))
  }, [])

  const exportDesignJson = useCallback(() => {
    return JSON.stringify(
      {
        version: 1,
        canvasW: canvasSize?.w ?? null,
        canvasH: canvasSize?.h ?? null,
        design: {
          ...design,
          // omit huge wrap from export by default — include if modest
          vehicleWrap:
            design.vehicleWrap && design.vehicleWrap.length < 200_000
              ? design.vehicleWrap
              : null,
        },
      },
      null,
      2,
    )
  }, [design, canvasSize])

  const importDesignJson = useCallback(
    (json: string, targetCanvas?: { w: number; h: number }) => {
      const result = parseDesignJson(json)
      if (!result.ok) return result
      let next = result.design
      const toW = targetCanvas?.w ?? canvasSize?.w ?? 0
      const toH = targetCanvas?.h ?? canvasSize?.h ?? 0
      if (toW > 2 && toH > 2) {
        next = adaptDesignToCanvas(
          next,
          toW,
          toH,
          result.canvasW,
          result.canvasH,
        )
      }
      // Keep sticker id counter ahead of anything imported
      for (const s of next.stickers) {
        const m = /^stk-(\d+)$/.exec(s.id)
        if (m) {
          const n = Number(m[1])
          if (n >= stickerSeq) stickerSeq = n + 1
        }
      }
      saveStoredWrap(next.vehicleWrap)
      setDesign(next)
      setBestLapMs(null)
      setSelectedStickerId(null)
      setSelectedPointIndex(null)
      setPendingSticker(null)
      setTool('reshape')
      setStep('draw')
      return { ok: true as const }
    },
    [canvasSize],
  )

  const recordLapTime = useCallback((ms: number) => {
    if (ms <= 0) return
    setBestLapMs((prev) => (prev === null || ms < prev ? ms : prev))
  }, [])

  const clearAll = useCallback((width = 800, height = 600) => {
    saveStoredWrap(null)
    setDesign({
      path: createCirclePath(width, height),
      stickers: [],
      vehicle: null,
      vehicleLook: 'stock',
      vehicleColor: null,
      vehicleWrap: null,
      reverseDirection: false,
      closed: true,
    })
    setBestLapMs(null)
    setSelectedStickerId(null)
    setSelectedPointIndex(null)
    setPendingSticker(null)
    setTool('reshape')
    setStep('draw')
  }, [])

  const canGenerate =
    design.closed && design.path.length >= MIN_POINTS && design.vehicle !== null

  const value = useMemo(
    () => ({
      step,
      setStep,
      design,
      canvasSize,
      setCanvasSize,
      setPath,
      updateControlPoint,
      insertControlPoint,
      removeControlPoint,
      resetCircle,
      scaleDesignToCanvas,
      tool,
      setTool,
      pendingSticker,
      setPendingSticker,
      addSticker,
      updateSticker,
      removeSticker,
      selectedStickerId,
      setSelectedStickerId,
      selectedPointIndex,
      setSelectedPointIndex,
      setVehicle,
      setVehicleLook,
      setVehicleColor,
      setVehicleWrap,
      toggleReverseDirection,
      exportDesignJson,
      importDesignJson,
      bestLapMs,
      recordLapTime,
      clearAll,
      canGenerate,
      loadStatus,
      setLoadStatus,
    }),
    [
      step,
      design,
      canvasSize,
      setCanvasSize,
      setPath,
      updateControlPoint,
      insertControlPoint,
      removeControlPoint,
      resetCircle,
      scaleDesignToCanvas,
      tool,
      pendingSticker,
      addSticker,
      updateSticker,
      removeSticker,
      selectedStickerId,
      selectedPointIndex,
      setVehicle,
      setVehicleLook,
      setVehicleColor,
      setVehicleWrap,
      toggleReverseDirection,
      exportDesignJson,
      importDesignJson,
      bestLapMs,
      recordLapTime,
      clearAll,
      canGenerate,
      loadStatus,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTrackStore(): TrackStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTrackStore must be used within TrackProvider')
  return ctx
}
