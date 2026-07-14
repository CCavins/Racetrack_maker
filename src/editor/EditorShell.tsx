import { useTrackStore } from '../state/trackStore'
import { TrackCanvas } from './TrackCanvas'
import { StickerPalette } from './StickerPalette'
import { VehiclePicker } from './VehiclePicker'
import './EditorShell.css'

export function EditorShell() {
  const {
    tool,
    setTool,
    resetCircle,
    clearAll,
    canGenerate,
    setStep,
    design,
    selectedStickerId,
    removeSticker,
    selectedPointIndex,
    removeControlPoint,
    setSelectedPointIndex,
  } = useTrackStore()

  const generate = () => {
    if (!canGenerate) return
    setStep('generating')
    window.setTimeout(() => setStep('race'), 900)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedStickerId) {
        e.preventDefault()
        removeSticker(selectedStickerId)
        return
      }
      if (selectedPointIndex !== null && design.path.length > 4) {
        e.preventDefault()
        removeControlPoint(selectedPointIndex)
        setSelectedPointIndex(null)
      }
    }
  }

  const resetTrack = () => {
    const canvas = document.querySelector(
      '.track-canvas',
    ) as HTMLCanvasElement | null
    const w = canvas?.width || 800
    const h = canvas?.height || 600
    resetCircle(w, h)
  }

  const resetEverything = () => {
    const canvas = document.querySelector(
      '.track-canvas',
    ) as HTMLCanvasElement | null
    clearAll(canvas?.width || 800, canvas?.height || 600)
  }

  return (
    <div className="editor-shell" onKeyDown={onKeyDown} tabIndex={0}>
      <aside className="editor-rail">
        <div className="brand-block">
          <p className="brand-name">Circuit Sketch</p>
          <p className="brand-tag">Shape it. Dress it. Race it.</p>
        </div>

        <div className="tool-row">
          {(
            [
              ['reshape', 'Reshape'],
              ['select', 'Stickers'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`tool-btn ${tool === id ? 'active' : ''}`}
              onClick={() => setTool(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rail-actions">
          <button type="button" className="ghost-btn" onClick={resetTrack}>
            Reset circle
          </button>
          <button type="button" className="ghost-btn" onClick={resetEverything}>
            Reset all
          </button>
        </div>

        <StickerPalette />
        <VehiclePicker />

        <div className="generate-block">
          <button
            type="button"
            className="generate-btn"
            disabled={!canGenerate}
            onClick={generate}
          >
            Generate 3D
          </button>
          {design.closed && !design.vehicle && (
            <p className="gen-hint">Pick a vehicle</p>
          )}
        </div>
      </aside>

      <main className="editor-main">
        <TrackCanvas />
      </main>
    </div>
  )
}
