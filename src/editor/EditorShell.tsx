import { useRef } from 'react'
import { useTrackStore } from '../state/trackStore'
import { getRaceVehicles } from '../types'
import { TrackCanvas } from './TrackCanvas'
import { StickerPalette } from './StickerPalette'
import { VehiclePicker } from './VehiclePicker'
import { preloadRaceAssets } from '../lib/preloadRaceAssets'
import './EditorShell.css'

export function EditorShell() {
  const importInputRef = useRef<HTMLInputElement>(null)
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
    toggleReverseDirection,
    exportDesignJson,
    importDesignJson,
    setLoadStatus,
  } = useTrackStore()

  const generate = async () => {
    if (!canGenerate) return
    setStep('generating')
    setLoadStatus('Loading vehicles & props…')
    try {
      await preloadRaceAssets(design, (label) => setLoadStatus(label))
      setLoadStatus('Starting race…')
      await new Promise((r) => window.setTimeout(r, 80))
      setStep('race')
    } catch (err) {
      console.error(err)
      setLoadStatus('Some assets failed — starting with fallbacks…')
      await new Promise((r) => window.setTimeout(r, 350))
      setStep('race')
    } finally {
      setLoadStatus(null)
    }
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

  const exportTrack = () => {
    const json = exportDesignJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'circuit-sketch-track.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const importTrack = () => {
    importInputRef.current?.click()
  }

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      const canvas = document.querySelector(
        '.track-canvas',
      ) as HTMLCanvasElement | null
      const target =
        canvas && canvas.width > 2 && canvas.height > 2
          ? { w: canvas.width, h: canvas.height }
          : undefined
      const result = importDesignJson(text, target)
      if (!result.ok) {
        window.alert(`Could not import track: ${result.error}`)
      }
    }
    reader.onerror = () => {
      window.alert('Could not read that file')
    }
    reader.readAsText(file)
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
          <button
            type="button"
            className={`ghost-btn ${design.reverseDirection ? 'active' : ''}`}
            onClick={toggleReverseDirection}
            title="Race direction around the track"
          >
            {design.reverseDirection ? 'Direction: CCW' : 'Direction: CW'}
          </button>
          <button type="button" className="ghost-btn" onClick={exportTrack}>
            Export JSON
          </button>
          <button type="button" className="ghost-btn" onClick={importTrack}>
            Import JSON
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="import-file-input"
            onChange={onImportFile}
            aria-hidden
            tabIndex={-1}
          />
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
          {design.closed && getRaceVehicles(design).length === 0 && (
            <p className="gen-hint">Pick at least one vehicle (up to 4)</p>
          )}
        </div>
      </aside>

      <main className="editor-main">
        <TrackCanvas />
      </main>
    </div>
  )
}
