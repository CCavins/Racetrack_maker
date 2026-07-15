import {
  MAX_RACERS,
  VEHICLE_IDS,
  VEHICLE_META,
  VEHICLE_PAINT_SWATCHES,
  getRaceVehicles,
  type VehicleId,
  type VehicleLookMode,
} from '../types'
import { useTrackStore } from '../state/trackStore'
import { WrapPainter } from './WrapPainter'
import './VehiclePicker.css'

const LOOK_MODES: { id: VehicleLookMode; label: string; hint: string }[] = [
  { id: 'stock', label: 'Stock', hint: 'Original model colors' },
  { id: 'paint', label: 'Paint', hint: 'Solid body color' },
  { id: 'wrap', label: 'Wrap', hint: 'Your drawn graphic' },
]

export function VehiclePicker() {
  const { design, setVehicle, toggleVehicle, setVehicleColor, setVehicleLook } =
    useTrackStore()
  const lineup = getRaceVehicles(design)
  const look = design.vehicleLook ?? 'stock'
  const activeColor =
    design.vehicleColor ??
    (design.vehicle ? VEHICLE_META[design.vehicle].color : '#e63946')

  const status =
    look === 'stock'
      ? 'Using stock look'
      : look === 'paint'
        ? `Using paint · ${activeColor}`
        : design.vehicleWrap
          ? 'Using custom wrap'
          : 'Wrap mode — draw & Apply below'

  return (
    <div className="vehicle-picker">
      <h3 className="rail-heading">Vehicles</h3>
      <p className="vehicle-lineup-hint">
        Pick up to {MAX_RACERS} · {lineup.length}/{MAX_RACERS} selected
        {lineup.length > 0 ? ' · tap again to remove' : ''}
      </p>
      <div className="vehicle-list">
        {VEHICLE_IDS.map((id: VehicleId) => {
          const meta = VEHICLE_META[id]
          const slot = lineup.indexOf(id)
          const selected = slot >= 0
          const focused = design.vehicle === id
          const paint =
            focused && look === 'paint' ? activeColor : meta.color
          const full = lineup.length >= MAX_RACERS && !selected
          return (
            <button
              key={id}
              type="button"
              className={`vehicle-card ${selected ? 'active' : ''} ${focused ? 'focused' : ''} ${full ? 'dimmed' : ''}`}
              onClick={() => {
                if (selected && focused) toggleVehicle(id)
                else if (selected) setVehicle(id)
                else toggleVehicle(id)
              }}
              disabled={full}
              style={
                selected
                  ? {
                      borderColor: paint,
                      boxShadow: focused
                        ? `inset 3px 0 0 ${paint}`
                        : `inset 2px 0 0 ${paint}88`,
                    }
                  : undefined
              }
            >
              <div
                className="vehicle-thumb"
                style={{ background: `${paint}33` }}
              >
                {selected && (
                  <span className="vehicle-slot" aria-hidden>
                    {slot + 1}
                  </span>
                )}
                <img
                  src={`${import.meta.env.BASE_URL}assets/vehicles/${id}-preview.png`}
                  alt=""
                  onError={(e) => {
                    const el = e.target as HTMLImageElement
                    el.style.display = 'none'
                    const fallback = el.nextElementSibling as HTMLElement | null
                    if (fallback) fallback.hidden = false
                  }}
                />
                <span className="vehicle-fallback" hidden aria-hidden>
                  {meta.label.slice(0, 1)}
                </span>
              </div>
              <div className="vehicle-info">
                <span className="vehicle-name">{meta.label}</span>
                <span className="vehicle-speed">
                  Speed {(meta.speed * 100).toFixed(0)}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {design.vehicle && (
        <>
          <div className="look-row">
            <p className="paint-label">
              Look · {VEHICLE_META[design.vehicle].label}
            </p>
            <div className="look-toggle" role="tablist" aria-label="Vehicle look">
              {LOOK_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={look === m.id}
                  className={`look-btn ${look === m.id ? 'active' : ''}`}
                  title={m.hint}
                  onClick={() => setVehicleLook(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="look-status">{status}</p>
          </div>

          {look === 'paint' && (
            <div className="paint-row">
              <p className="paint-label">Color</p>
              <div className="paint-swatches">
                {VEHICLE_PAINT_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    className={`paint-swatch ${activeColor.toLowerCase() === hex.toLowerCase() ? 'active' : ''}`}
                    style={{ background: hex }}
                    title={hex}
                    onClick={() => setVehicleColor(hex)}
                  />
                ))}
                <label className="paint-custom" title="Custom color">
                  <input
                    type="color"
                    value={activeColor}
                    onChange={(e) => setVehicleColor(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}

          {look === 'wrap' && <WrapPainter />}
        </>
      )}
    </div>
  )
}
