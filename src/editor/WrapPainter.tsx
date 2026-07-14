import { useEffect, useRef, useState } from 'react'
import { useTrackStore } from '../state/trackStore'
import './WrapPainter.css'

const W = 384
const H = 192

function canvasToWrapDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/jpeg', 0.75)
}

export function WrapPainter() {
  const { design, setVehicleWrap } = useTrackStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const dirty = useRef(false)
  const seededForVehicle = useRef<string | null>(null)
  const [brush, setBrush] = useState('#ffffff')
  const [size, setSize] = useState(10)
  const [erasing, setErasing] = useState(false)
  const [saved, setSaved] = useState(Boolean(design.vehicleWrap))
  const brushRef = useRef(brush)
  const sizeRef = useRef(size)
  const eraseRef = useRef(erasing)

  brushRef.current = brush
  sizeRef.current = size
  eraseRef.current = erasing

  // Restore wrap onto the canvas when mounting / switching vehicles — never wipe a saved wrap
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const vehicleKey = design.vehicle ?? ''
    if (seededForVehicle.current === vehicleKey) return
    seededForVehicle.current = vehicleKey

    const paintBlank = () => {
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#2a2d32'
      ctx.fillRect(0, 0, W, H)
    }

    if (design.vehicleWrap) {
      const img = new Image()
      img.onload = () => {
        paintBlank()
        ctx.drawImage(img, 0, 0, W, H)
        setSaved(true)
      }
      img.onerror = () => {
        paintBlank()
        setSaved(false)
      }
      img.src = design.vehicleWrap
    } else {
      paintBlank()
      setSaved(false)
    }
  }, [design.vehicle, design.vehicleWrap])

  const persistCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas || !dirty.current) return
    dirty.current = false
    const url = canvasToWrapDataUrl(canvas)
    setVehicleWrap(url)
    setSaved(true)
  }

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    }
  }

  const strokeTo = (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.globalCompositeOperation = eraseRef.current
      ? 'destination-out'
      : 'source-over'
    ctx.strokeStyle = brushRef.current
    ctx.lineWidth = sizeRef.current
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    dirty.current = true
  }

  const onDown = (e: React.PointerEvent) => {
    drawing.current = true
    canvasRef.current?.setPointerCapture(e.pointerId)
    const p = pos(e)
    lastPos.current = p
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx) {
      ctx.globalCompositeOperation = eraseRef.current
        ? 'destination-out'
        : 'source-over'
      ctx.fillStyle = brushRef.current
      ctx.beginPath()
      ctx.arc(p.x, p.y, sizeRef.current / 2, 0, Math.PI * 2)
      ctx.fill()
      dirty.current = true
    }
  }

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current || !lastPos.current) return
    const p = pos(e)
    strokeTo(lastPos.current, p)
    lastPos.current = p
  }

  const onUp = () => {
    drawing.current = false
    lastPos.current = null
    persistCanvas()
  }

  // Flush pending strokes if the panel unmounts (e.g. opening the race)
  useEffect(() => {
    return () => {
      const canvas = canvasRef.current
      if (!canvas || !dirty.current) return
      dirty.current = false
      setVehicleWrap(canvasToWrapDataUrl(canvas))
    }
  }, [setVehicleWrap])

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#2a2d32'
    ctx.fillRect(0, 0, W, H)
    dirty.current = true
    persistCanvas()
  }

  const remove = () => {
    dirty.current = false
    setVehicleWrap(null)
    seededForVehicle.current = null
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx) {
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#2a2d32'
      ctx.fillRect(0, 0, W, H)
    }
    setSaved(false)
  }

  if (!design.vehicle) {
    return (
      <div className="wrap-painter muted">
        <p className="wrap-hint">Pick a vehicle to paint a wrap.</p>
      </div>
    )
  }

  return (
    <div className="wrap-painter">
      <h4 className="wrap-heading">Wrap</h4>
      <p className="wrap-hint">
        Draw the full panel — it stretches across the vehicle body (length × height).
        Auto-saves until you remove it.
      </p>
      <canvas
        ref={canvasRef}
        className="wrap-canvas"
        width={W}
        height={H}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
      <div className="wrap-tools">
        <label className="wrap-tool">
          Color
          <input
            type="color"
            value={brush}
            onChange={(e) => {
              setBrush(e.target.value)
              setErasing(false)
            }}
          />
        </label>
        <label className="wrap-tool">
          Size
          <input
            type="range"
            min={4}
            max={36}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          className={`ghost-btn ${erasing ? 'active' : ''}`}
          onClick={() => setErasing((v) => !v)}
        >
          Eraser
        </button>
      </div>
      <div className="wrap-actions">
        <button type="button" className="ghost-btn" onClick={clear}>
          Clear canvas
        </button>
        <button type="button" className="ghost-btn" onClick={remove}>
          Remove wrap
        </button>
      </div>
      {saved && design.vehicleWrap && (
        <p className="wrap-status">Wrap saved — it will show in the race and when you return.</p>
      )}
    </div>
  )
}
