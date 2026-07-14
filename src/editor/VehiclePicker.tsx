import { VEHICLE_IDS, VEHICLE_META, type VehicleId } from '../types'
import { useTrackStore } from '../state/trackStore'
import './VehiclePicker.css'

export function VehiclePicker() {
  const { design, setVehicle } = useTrackStore()

  return (
    <div className="vehicle-picker">
      <h3 className="rail-heading">Vehicle</h3>
      <div className="vehicle-list">
        {VEHICLE_IDS.map((id: VehicleId) => {
          const meta = VEHICLE_META[id]
          return (
            <button
              key={id}
              type="button"
              className={`vehicle-card ${design.vehicle === id ? 'active' : ''}`}
              onClick={() => setVehicle(id)}
            >
              <div
                className="vehicle-thumb"
                style={{ background: `${meta.color}33` }}
              >
                <img
                  src={`/assets/vehicles/${id}-preview.png`}
                  alt={meta.label}
                  onError={(e) => {
                    const el = e.target as HTMLImageElement
                    el.style.display = 'none'
                    const fallback = el.nextElementSibling as HTMLElement | null
                    if (fallback) fallback.hidden = false
                  }}
                />
                <span className="vehicle-fallback" hidden style={{ color: meta.color }}>
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
    </div>
  )
}
