import { useCallback, useEffect, useRef, useState } from 'react'
import { useTrackStore } from '../state/trackStore'
import {
  createCirclePath,
  hitTestPoint,
  nearestSegment,
  smoothClosedPath,
  snapToClosedPath,
} from '../lib/pathSmooth'
import {
  STICKER_META,
  isTrackBand,
  snapsToTrack,
  type Sticker,
  type StickerType,
  type Vec2,
} from '../types'
import './TrackCanvas.css'

const HANDLE_RADIUS = 10
const MIN_POINTS = 4
const ROAD_PX = 36

function getCanvasPos(
  e: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
): Vec2 {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  }
}

function canvasToCss(canvas: HTMLCanvasElement, p: Vec2): Vec2 {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (p.x / canvas.width) * rect.width,
    y: (p.y / canvas.height) * rect.height,
  }
}

function drawTrackBand(
  ctx: CanvasRenderingContext2D,
  s: Pick<Sticker, 'type' | 'x' | 'y' | 'rotation' | 'scale'>,
  ghost = false,
) {
  const meta = STICKER_META[s.type]
  const across = ROAD_PX * 0.95
  const along =
    (s.type === 'jump' ? 52 : s.type === 'boost' ? 48 : 40) * s.scale

  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(s.rotation)
  ctx.globalAlpha = ghost ? 0.55 : 0.95

  const x0 = -across / 2
  const y0 = -along / 2

  if (s.type === 'boost') {
    // Soft translucent wash — not a solid blue pad
    const wash = ctx.createLinearGradient(0, y0, 0, -y0)
    wash.addColorStop(0, 'rgba(30, 140, 255, 0.15)')
    wash.addColorStop(0.5, 'rgba(60, 190, 255, 0.35)')
    wash.addColorStop(1, 'rgba(30, 140, 255, 0.15)')
    ctx.fillStyle = wash
    ctx.beginPath()
    ctx.roundRect(x0, y0, across, along, 6)
    ctx.fill()

    // Glowing forward Vs (tip points along travel / rotation direction)
    const drawV = (cy: number, w: number, glow: boolean) => {
      ctx.beginPath()
      ctx.moveTo(0, cy + along * 0.16)
      ctx.lineTo(w, cy - along * 0.12)
      ctx.lineTo(w * 0.35, cy - along * 0.12)
      ctx.lineTo(0, cy + along * 0.02)
      ctx.lineTo(-w * 0.35, cy - along * 0.12)
      ctx.lineTo(-w, cy - along * 0.12)
      ctx.closePath()
      if (glow) {
        ctx.shadowColor = '#5ecfff'
        ctx.shadowBlur = 12
      }
      ctx.fillStyle = glow ? 'rgba(200, 245, 255, 0.95)' : 'rgba(110, 210, 255, 0.85)'
      ctx.fill()
      ctx.shadowBlur = 0
    }
    drawV(-along * 0.22, across * 0.28, true)
    drawV(0, across * 0.26, true)
    drawV(along * 0.22, across * 0.24, true)
  } else {
    ctx.fillStyle = meta.color
    ctx.strokeStyle = ghost ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.rect(x0, y0, across, along)
    ctx.fill()
    ctx.stroke()

    if (s.type === 'jump') {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(-across * 0.28, along * 0.2)
      ctx.lineTo(0, -along * 0.25)
      ctx.lineTo(across * 0.28, along * 0.2)
      ctx.stroke()
    }

    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.max(10, 11 * s.scale)}px "DM Sans", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(meta.label.toUpperCase(), 0, along * 0.32)
  }

  ctx.restore()
}

function drawPropSticker(
  ctx: CanvasRenderingContext2D,
  s: Sticker,
  selected: boolean,
  ghost = false,
) {
  const meta = STICKER_META[s.type]
  const size = 36 * s.scale
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(s.rotation)
  ctx.globalAlpha = ghost ? 0.55 : 1

  if (selected) {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.strokeRect(-size / 2 - 4, -size / 2 - 4, size + 8, size + 8)
    ctx.setLineDash([])
  }

  const img = stickerImageCache[s.type]
  if (img?.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size)
  } else {
    ctx.fillStyle = meta.color
    ctx.beginPath()
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${Math.max(9, size * 0.28)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(meta.label.slice(0, 4).toUpperCase(), 0, 0)
  }
  ctx.restore()
}

export function TrackCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragPointRef = useRef<number | null>(null)
  const dragStickerRef = useRef<string | null>(null)
  const [hoverPoint, setHoverPoint] = useState<number | null>(null)
  const [snapGhost, setSnapGhost] = useState<{
    type: StickerType
    x: number
    y: number
    rotation: number
    scale: number
  } | null>(null)
  const [popupCss, setPopupCss] = useState<Vec2 | null>(null)
  const initializedRef = useRef(false)
  const lastSizeRef = useRef<{ w: number; h: number } | null>(null)
  const redrawRef = useRef<() => void>(() => {})
  const pathLenRef = useRef(0)

  const {
    design,
    setPath,
    updateControlPoint,
    insertControlPoint,
    scaleDesignToCanvas,
    canvasSize,
    setCanvasSize,
    tool,
    pendingSticker,
    addSticker,
    updateSticker,
    removeSticker,
    selectedStickerId,
    setSelectedStickerId,
    selectedPointIndex,
    setSelectedPointIndex,
    setTool,
  } = useTrackStore()

  pathLenRef.current = design.path.length
  if (lastSizeRef.current === null && canvasSize) {
    lastSizeRef.current = canvasSize
  }

  const selectedSticker = design.stickers.find((s) => s.id === selectedStickerId)

  const updatePopupPos = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !selectedSticker) {
      setPopupCss(null)
      return
    }
    setPopupCss(canvasToCss(canvas, { x: selectedSticker.x, y: selectedSticker.y }))
  }, [selectedSticker])

  useEffect(() => {
    updatePopupPos()
  }, [updatePopupPos, design.stickers, selectedStickerId])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height

    const grad = ctx.createLinearGradient(0, 0, w, h)
    grad.addColorStop(0, '#3d5a45')
    grad.addColorStop(0.5, '#4a6b52')
    grad.addColorStop(1, '#35503e')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    const controls = design.path
    if (controls.length > 1) {
      const road = smoothClosedPath(controls, 3)

      ctx.strokeStyle = '#2c2c2e'
      ctx.lineWidth = ROAD_PX
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(road[0].x, road[0].y)
      for (let i = 1; i < road.length; i++) ctx.lineTo(road[i].x, road[i].y)
      ctx.closePath()
      ctx.stroke()

      ctx.strokeStyle = '#e8b923'
      ctx.lineWidth = 2
      ctx.setLineDash([10, 12])
      ctx.beginPath()
      ctx.moveTo(road[0].x, road[0].y)
      for (let i = 1; i < road.length; i++) ctx.lineTo(road[i].x, road[i].y)
      ctx.closePath()
      ctx.stroke()
      ctx.setLineDash([])

      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([8, 10])
      ctx.beginPath()
      ctx.moveTo(road[0].x, road[0].y)
      for (let i = 1; i < road.length; i++) ctx.lineTo(road[i].x, road[i].y)
      ctx.closePath()
      ctx.stroke()
      ctx.setLineDash([])

      ctx.strokeStyle = 'rgba(232, 185, 35, 0.35)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(controls[0].x, controls[0].y)
      for (let i = 1; i < controls.length; i++) {
        ctx.lineTo(controls[i].x, controls[i].y)
      }
      ctx.closePath()
      ctx.stroke()

      ctx.fillStyle = '#e8b923'
      ctx.beginPath()
      ctx.arc(controls[0].x, controls[0].y, 6, 0, Math.PI * 2)
      ctx.fill()

      for (let i = 0; i < controls.length; i++) {
        const p = controls[i]
        const selected = selectedPointIndex === i
        const hovered = hoverPoint === i
        const r = selected || hovered ? HANDLE_RADIUS + 2 : HANDLE_RADIUS

        ctx.beginPath()
        ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2)
        ctx.fillStyle = selected
          ? 'rgba(232, 185, 35, 0.35)'
          : 'rgba(0,0,0,0.25)'
        ctx.fill()

        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = selected ? '#e8b923' : '#f4f0e8'
        ctx.fill()
        ctx.strokeStyle = selected ? '#1a1a14' : 'rgba(20,20,20,0.55)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    for (const s of design.stickers) {
      if (isTrackBand(s.type)) {
        drawTrackBand(ctx, s)
        if (selectedStickerId === s.id) {
          ctx.save()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.setLineDash([5, 4])
          ctx.translate(s.x, s.y)
          ctx.rotate(s.rotation)
          const across = ROAD_PX * 0.95
          const along = (s.type === 'jump' ? 52 : 44) * s.scale
          ctx.strokeRect(-across / 2 - 4, -along / 2 - 4, across + 8, along + 8)
          ctx.restore()
        }
      } else {
        drawPropSticker(ctx, s, selectedStickerId === s.id)
      }
    }

    if (snapGhost) {
      if (isTrackBand(snapGhost.type)) {
        drawTrackBand(ctx, snapGhost, true)
      } else {
        drawPropSticker(
          ctx,
          { ...snapGhost, id: 'ghost' },
          false,
          true,
        )
      }
    }
  }, [
    design,
    selectedStickerId,
    selectedPointIndex,
    hoverPoint,
    snapGhost,
  ])

  redrawRef.current = redraw

  // Size the canvas once on mount; keep ResizeObserver deps stable so hover/redraw
  // changes don't tear it down (that was wiping the bitmap and making the track vanish).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const applySize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = parent.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return

      const nextW = Math.max(1, Math.round(rect.width * dpr))
      const nextH = Math.max(1, Math.round(rect.height * dpr))
      const prev = lastSizeRef.current

      if (canvas.width !== nextW || canvas.height !== nextH) {
        if (
          prev &&
          prev.w > 0 &&
          prev.h > 0 &&
          pathLenRef.current >= 4 &&
          (prev.w !== nextW || prev.h !== nextH)
        ) {
          scaleDesignToCanvas(prev.w, prev.h, nextW, nextH)
        }
        canvas.width = nextW
        canvas.height = nextH
        canvas.style.width = `${rect.width}px`
        canvas.style.height = `${rect.height}px`
        lastSizeRef.current = { w: nextW, h: nextH }
        setCanvasSize(nextW, nextH)
      }

      if (!initializedRef.current) {
        initializedRef.current = true
        if (pathLenRef.current < 4) {
          setPath(createCirclePath(nextW, nextH))
          return
        }
      }

      redrawRef.current()
    }

    applySize()
    const ro = new ResizeObserver(() => {
      applySize()
    })
    ro.observe(parent)
    window.addEventListener('resize', applySize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', applySize)
    }
  }, [setPath, scaleDesignToCanvas, setCanvasSize])

  useEffect(() => {
    redraw()
  }, [redraw])

  useEffect(() => {
    for (const type of Object.keys(STICKER_META) as StickerType[]) {
      if (stickerImageCache[type]) continue
      const img = new Image()
      img.src = `/assets/stickers/${type}.png`
      img.onload = () => redrawRef.current()
      stickerImageCache[type] = img
    }
  }, [])

  const hitTestSticker = (pos: Vec2): string | null => {
    for (let i = design.stickers.length - 1; i >= 0; i--) {
      const s = design.stickers[i]
      if (isTrackBand(s.type)) {
        // approximate band hit as circle for simplicity
        const hitR = 28 * s.scale
        if (Math.hypot(pos.x - s.x, pos.y - s.y) < hitR) return s.id
      } else {
        const size = 36 * s.scale
        if (Math.hypot(pos.x - s.x, pos.y - s.y) < size / 2 + 6) return s.id
      }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    const pos = getCanvasPos(e, canvas)
    const hitRadius = HANDLE_RADIUS + 8

    if (tool === 'sticker' && pendingSticker) {
      if (snapsToTrack(pendingSticker)) {
        const snap = snapToClosedPath(design.path, pos)
        addSticker({
          type: pendingSticker,
          x: snap.point.x,
          y: snap.point.y,
          rotation: snap.angle,
          scale: 1,
          pathT: snap.t,
        })
      } else {
        addSticker({
          type: pendingSticker,
          x: pos.x,
          y: pos.y,
          rotation: 0,
          scale: 1,
        })
      }
      setSelectedStickerId(null)
      // Stay in sticker mode so the same type can be placed repeatedly
      return
    }

    if (tool === 'reshape') {
      const pt = hitTestPoint(design.path, pos, hitRadius)
      if (pt >= 0) {
        dragPointRef.current = pt
        setSelectedPointIndex(pt)
        setSelectedStickerId(null)
        return
      }
      const seg = nearestSegment(design.path, pos)
      if (seg.distance < 28) {
        insertControlPoint(seg.index, seg.closest)
        dragPointRef.current = seg.index + 1
        return
      }
      setSelectedPointIndex(null)
      return
    }

    if (tool === 'select' || tool === 'sticker') {
      const stickerHit = hitTestSticker(pos)
      if (stickerHit) {
        setSelectedStickerId(stickerHit)
        setSelectedPointIndex(null)
        dragStickerRef.current = stickerHit
        setTool('select')
        return
      }
      const pt = hitTestPoint(design.path, pos, hitRadius)
      if (pt >= 0) {
        dragPointRef.current = pt
        setSelectedPointIndex(pt)
        setSelectedStickerId(null)
        setTool('reshape')
        return
      }
      setSelectedStickerId(null)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const pos = getCanvasPos(e, canvas)

    if (dragPointRef.current !== null) {
      updateControlPoint(dragPointRef.current, pos)
      return
    }

    if (dragStickerRef.current) {
      const sticker = design.stickers.find((s) => s.id === dragStickerRef.current)
      if (sticker && snapsToTrack(sticker.type)) {
        const snap = snapToClosedPath(design.path, pos)
        updateSticker(dragStickerRef.current, {
          x: snap.point.x,
          y: snap.point.y,
          rotation: snap.angle,
          pathT: snap.t,
        })
      } else if (dragStickerRef.current) {
        updateSticker(dragStickerRef.current, {
          x: pos.x,
          y: pos.y,
        })
      }
      return
    }

    if (tool === 'sticker' && pendingSticker && design.path.length >= 3) {
      if (snapsToTrack(pendingSticker)) {
        const snap = snapToClosedPath(design.path, pos)
        setSnapGhost({
          type: pendingSticker,
          x: snap.point.x,
          y: snap.point.y,
          rotation: snap.angle,
          scale: 1,
        })
      } else {
        setSnapGhost({
          type: pendingSticker,
          x: pos.x,
          y: pos.y,
          rotation: 0,
          scale: 1,
        })
      }
      canvas.style.cursor = 'copy'
      return
    }

    if (snapGhost) setSnapGhost(null)

    if (tool === 'reshape' || tool === 'select') {
      const pt = hitTestPoint(design.path, pos, HANDLE_RADIUS + 8)
      setHoverPoint(pt >= 0 ? pt : null)
      const stickerHit = hitTestSticker(pos)
      canvas.style.cursor =
        pt >= 0 ? 'grab' : stickerHit ? 'pointer' : tool === 'reshape' ? 'crosshair' : 'default'
    }
  }

  const onPointerUp = () => {
    dragPointRef.current = null
    dragStickerRef.current = null
  }

  const onPointerLeave = () => {
    setSnapGhost(null)
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (tool !== 'reshape') return
    const canvas = canvasRef.current
    if (!canvas) return
    const pos = getCanvasPos(e, canvas)
    const pt = hitTestPoint(design.path, pos, HANDLE_RADIUS + 8)
    if (pt >= 0) return
    const seg = nearestSegment(design.path, pos)
    if (seg.distance < 40) {
      insertControlPoint(seg.index, pos)
    }
  }

  const hint =
    tool === 'sticker' && pendingSticker
      ? snapsToTrack(pendingSticker)
        ? `Click to place ${STICKER_META[pendingSticker].label} · click again for more · click the sticker to deselect`
        : `Click to place ${STICKER_META[pendingSticker].label} · click again for more · click the sticker to deselect`
      : selectedPointIndex !== null && design.path.length > MIN_POINTS
        ? 'Drag handles to reshape · Delete removes selected point'
        : 'Drag handles to reshape · click the edge to add a point'

  return (
    <div className="track-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="track-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
      />

      {selectedSticker && popupCss && (
        <div
          className="sticker-popup"
          style={{ left: popupCss.x, top: popupCss.y }}
        >
          <span className="sticker-popup-label">
            {STICKER_META[selectedSticker.type].label}
          </span>
          <button
            type="button"
            className="sticker-popup-remove"
            onClick={() => {
              removeSticker(selectedSticker.id)
              setSelectedStickerId(null)
            }}
          >
            Remove
          </button>
        </div>
      )}

      <div className="canvas-hint">{hint}</div>
    </div>
  )
}

const stickerImageCache: Partial<Record<string, HTMLImageElement>> = {}
