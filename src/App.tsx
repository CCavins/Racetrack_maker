import { TrackProvider, useTrackStore } from './state/trackStore'
import { MidiControlProvider } from './midi/midiControlStore'
import { EditorShell } from './editor/EditorShell'
import { RaceView } from './race/RaceView'
import { SpectatorView } from './race/SpectatorView'
import { isSpectateMode } from './race/raceBroadcast'
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

  return (
    <>
      <EditorShell />
      {step === 'generating' && <GeneratingOverlay />}
    </>
  )
}

export default function App() {
  if (isSpectateMode()) {
    return (
      <TrackProvider>
        <div className="app-root">
          <SpectatorView />
        </div>
      </TrackProvider>
    )
  }

  return (
    <TrackProvider>
      <MidiControlProvider>
        <div className="app-root">
          <AppSteps />
        </div>
      </MidiControlProvider>
    </TrackProvider>
  )
}
