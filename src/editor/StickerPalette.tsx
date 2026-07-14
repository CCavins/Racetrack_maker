import { STICKER_META, STICKER_TYPES, type StickerType } from '../types'
import { useTrackStore } from '../state/trackStore'
import './StickerPalette.css'

export function StickerPalette() {
  const { pendingSticker, setPendingSticker, setTool, setSelectedStickerId } =
    useTrackStore()

  const pick = (type: StickerType) => {
    if (pendingSticker === type) {
      setPendingSticker(null)
      setTool('reshape')
      return
    }
    setPendingSticker(type)
    setSelectedStickerId(null)
    setTool('sticker')
  }

  return (
    <div className="sticker-palette">
      <h3 className="rail-heading">Stickers</h3>
      <p className="sticker-help">
        Jump, boost, cone, and barrier snap to the track. Click a sticker again to deselect.
        Keep clicking the canvas to place multiples.
      </p>
      <div className="sticker-grid">
        {STICKER_TYPES.map((type) => {
          const meta = STICKER_META[type]
          return (
            <button
              key={type}
              type="button"
              className={`sticker-btn ${pendingSticker === type ? 'active' : ''}`}
              onClick={() => pick(type)}
              title={meta.label}
            >
              <span
                className="sticker-swatch"
                style={{ background: meta.color }}
              >
                <img
                  src={`${import.meta.env.BASE_URL}assets/stickers/${type}.png`}
                  alt=""
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
    </div>
  )
}
