import { TrackProvider, useTrackStore } from './state/trackStore'
import { EditorShell } from './editor/EditorShell'
import { RaceView } from './race/RaceView'
import './styles/app.css'

function GeneratingOverlay() {
  return (
    <div className="generating-overlay">
      <div className="generating-card">
        <p className="generating-title">Building track</p>
        <p className="generating-sub">Extruding asphalt · planting chaos · warming engines</p>
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
  if (step === 'generating') {
    return (
      <>
        <EditorShell />
        <GeneratingOverlay />
      </>
    )
  }
  return <EditorShell />
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
