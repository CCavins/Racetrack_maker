import { TrackProvider, useTrackStore } from './state/trackStore'
import { EditorShell } from './editor/EditorShell'
import { RaceView } from './race/RaceView'
import './styles/app.css'

function GeneratingOverlay() {
  const { loadStatus } = useTrackStore()
  return (
    <div className="generating-overlay">
      <div className="generating-card">
        <p className="generating-title">Building track</p>
        <p className="generating-sub">
          {loadStatus ?? 'Extruding asphalt · planting chaos · warming engines'}
        </p>
        <div className="generating-bar">
          <span />
        </div>
      </div>
    </div>
  )
}

function AppSteps() {
  const { step } = useTrackStore()

  if (step === 'race') return <RaceView />

  // Keep EditorShell mounted across draw ↔ generating so wrap canvas isn't wiped
  return (
    <>
      <EditorShell />
      {step === 'generating' && <GeneratingOverlay />}
    </>
  )
}

export default function App() {
  return (
    <TrackProvider>
      <div className="app-root">
        <AppSteps />
      </div>
    </TrackProvider>
  )
}
