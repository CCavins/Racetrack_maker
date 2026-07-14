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
  Vec2,
} from '../types'
import { createCirclePath, resnapStickersToPath } from '../lib/pathSmooth'

const STORAGE_KEY = 'circuit-sketch-v1'

type PersistedState = {
  design: TrackDesign
  step: AppStep
  stickerSeq: number
  canvasW?: number
  canvasH?: number
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
  clearAll: (width?: number, height?: number) => void
  canGenerate: boolean
}

const Ctx = createContext<TrackStore | null>(null)

const MIN_POINTS = 4

const emptyDesign = (): TrackDesign => ({
  path: [],
  stickers: [],
  vehicle: null,
  closed: true,
})

let stickerSeq = 0

function withResnapped(path: Vec2[], stickers: Sticker[]): Sticker[] {
  return resnapStickersToPath(path, stickers)
}

function loadPersisted(): {
  design: TrackDesign
  step: AppStep
  canvasSize: { w: number; h: number } | null
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
    const design = { ...emptyDesign(), ...data.design, closed: true }
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
    }
  } catch {
    return null
  }
}

function savePersisted(
  design: TrackDesign,
  step: AppStep,
  canvasSize: { w: number; h: number } | null,
) {
  try {
    const payload: PersistedState = {
      design,
      step: step === 'generating' ? 'draw' : step,
      stickerSeq,
      canvasW: canvasSize?.w,
      canvasH: canvasSize?.h,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // quota / private mode — ignore
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
  const [tool, setTool] = useState<EditorTool>('reshape')
  const [pendingSticker, setPendingSticker] = useState<StickerType | null>(null)
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null)
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  )

  useEffect(() => {
    savePersisted(design, step, canvasSize)
  }, [design, step, canvasSize])

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

  const clearAll = useCallback((width = 800, height = 600) => {
    setDesign({
      path: createCirclePath(width, height),
      stickers: [],
      vehicle: null,
      closed: true,
    })
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
      clearAll,
      canGenerate,
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
      clearAll,
      canGenerate,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTrackStore(): TrackStore {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTrackStore must be used within TrackProvider')
  return ctx
}
