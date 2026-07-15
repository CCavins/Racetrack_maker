import { useRef, useState } from 'react'
import { STICKER_META, STICKER_TYPES, snapsToTrack, type StickerType } from '../types'
import { clientToDesignPos } from '../lib/designCanvas'
import { snapToClosedPath } from '../lib/pathSmooth'
import { useTrackStore } from '../state/trackStore'
import './StickerPalette.css'

const DRAG_THRESHOLD = 8

function clientToCanvasPos(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
) {
  return clientToDesignPos(clientX, clientY, canvas)
}

export function StickerPalette() {
  const {
    pendingSticker,
    setPendingSticker,
    setTool,
    setSelectedStickerId,
    design,
    addSticker,
  } = useTrackStore()

  const dragRef = useRef<{
    type: StickerType
    startX: number
    startY: number
    dragging: boolean
    pointerId: number
  } | null>(null)
  const [dragGhost, setDragGhost] = useState<{
    type: StickerType
    x: number
    y: number
    overCanvas: boolean
  } | null>(null)

  const selectForPlace = (type: StickerType) => {
    setPendingSticker(type)
    setSelectedStickerId(null)
    setTool('sticker')
  }

  const toggleSelect = (type: StickerType) => {
    if (pendingSticker === type) {
      setPendingSticker(null)
      setTool('reshape')
      return
    }
    selectForPlace(type)
  }

  const placeAtClient = (type: StickerType, clientX: number, clientY: number) => {
    const canvas = document.querySelector(
      '.track-canvas',
    ) as HTMLCanvasElement | null
    if (!canvas || design.path.length < 3) return false
    const { x, y, over } = clientToCanvasPos(clientX, clientY, canvas)
    if (!over) return false

    if (snapsToTrack(type)) {
      const snap = snapToClosedPath(design.path, { x, y })
      addSticker({
        type,
        x: snap.point.x,
        y: snap.point.y,
        rotation: snap.angle,
        scale: 1,
        pathT: snap.t,
      })
    } else {
      addSticker({
        type,
        x,
        y,
        rotation: 0,
        scale: 1,
      })
    }
    setSelectedStickerId(null)
    selectForPlace(type)
    return true
  }

  const onPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    type: StickerType,
  ) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      pointerId: e.pointerId,
    }
  }

  const onPointerMove = (
    e: React.PointerEvent<HTMLButtonElement>,
    type: StickerType,
  ) => {
    const drag = dragRef.current
    if (!drag || drag.type !== type || drag.pointerId !== e.pointerId) return

    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      drag.dragging = true
      selectForPlace(type)
    }
    if (!drag.dragging) return

    const canvas = document.querySelector(
      '.track-canvas',
    ) as HTMLCanvasElement | null
    let overCanvas = false
    if (canvas) {
      overCanvas = clientToCanvasPos(e.clientX, e.clientY, canvas).over
    }
    setDragGhost({
      type,
      x: e.clientX,
      y: e.clientY,
      overCanvas,
    })
  }

  const endPointer = (
    e: React.PointerEvent<HTMLButtonElement>,
    type: StickerType,
  ) => {
    const drag = dragRef.current
    if (!drag || drag.type !== type || drag.pointerId !== e.pointerId) return
    dragRef.current = null

    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }

    const wasDragging = drag.dragging
    setDragGhost(null)

    if (wasDragging) {
      placeAtClient(type, e.clientX, e.clientY)
      return
    }

    // Click / tap: select for place-on-canvas (or deselect if same)
    toggleSelect(type)
  }

  return (
    <div className="sticker-palette">
      <h3 className="rail-heading">Stickers</h3>
      <p className="sticker-help">
        Drag onto the track, or tap a sticker then tap the canvas. Jump, boost,
        cone, and barrier snap to the course. Tap the same sticker again to
        deselect.
      </p>
      <div className="sticker-grid">
        {STICKER_TYPES.map((type) => {
          const meta = STICKER_META[type]
          return (
            <button
              key={type}
              type="button"
              className={`sticker-btn ${pendingSticker === type ? 'active' : ''}`}
              title={`${meta.label} — drag onto track or tap then tap canvas`}
              onPointerDown={(e) => onPointerDown(e, type)}
              onPointerMove={(e) => onPointerMove(e, type)}
              onPointerUp={(e) => endPointer(e, type)}
              onPointerCancel={(e) => endPointer(e, type)}
            >
              <span
                className="sticker-swatch"
                style={{ background: meta.color }}
              >
                <img
                  src={`${import.meta.env.BASE_URL}assets/stickers/${type}.png`}
                  alt=""
                  draggable={false}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </span>
              <span className="sticker-label">{meta.label}</span>
            </button>
          )
        })}
      </div>

      {dragGhost && (
        <div
          className={`sticker-drag-ghost ${dragGhost.overCanvas ? 'over-canvas' : ''}`}
          style={{
            left: dragGhost.x,
            top: dragGhost.y,
            background: STICKER_META[dragGhost.type].color,
          }}
          aria-hidden
        >
          <img
            src={`${import.meta.env.BASE_URL}assets/stickers/${dragGhost.type}.png`}
            alt=""
            draggable={false}
          />
        </div>
      )}
    </div>
  )
}
