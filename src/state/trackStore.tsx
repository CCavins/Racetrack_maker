import {
  createContext,
  useCallback,
  useContext,
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

type TrackStore = {
  step: AppStep
  setStep: (s: AppStep) => void
  design: TrackDesign
  setPath: (path: Vec2[]) => void
  updateControlPoint: (index: number, pos: Vec2) => void
  insertControlPoint: (afterIndex: number, pos: Vec2) => void
  removeControlPoint: (index: number) => void
  resetCircle: (width: number, height: number) => void
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

export function TrackProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<AppStep>('draw')
  const [design, setDesign] = useState<TrackDesign>(emptyDesign)
  const [tool, setTool] = useState<EditorTool>('reshape')
  const [pendingSticker, setPendingSticker] = useState<StickerType | null>(null)
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null)
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  )

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
  }, [])

  const canGenerate =
    design.closed && design.path.length >= MIN_POINTS && design.vehicle !== null

  const value = useMemo(
    () => ({
      step,
      setStep,
      design,
      setPath,
      updateControlPoint,
      insertControlPoint,
      removeControlPoint,
      resetCircle,
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
      setPath,
      updateControlPoint,
      insertControlPoint,
      removeControlPoint,
      resetCircle,
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
