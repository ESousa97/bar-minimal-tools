/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AudioPopup from './components/popup/AudioPopup'
import { CalendarPopup } from './components/popup/CalendarPopup'
import CpuPopup from './components/popup/CpuPopup'
import DevColorPopup from './components/popup/DevColorPopup'
import FoldersPopup from './components/popup/FoldersPopup'
import GpuPopup from './components/popup/GpuPopup'
import HeadsetPopup from './components/popup/HeadsetPopup'
import MediaPopup from './components/popup/MediaPopup'
import NetworkPopup from './components/popup/NetworkPopup'
import NotesPopup from './components/popup/NotesPopup'
import PowerPopup from './components/popup/PowerPopup'
import RamPopup from './components/popup/RamPopup'
import SettingsPopup from './components/popup/SettingsPopup'
import StoragePopup from './components/popup/StoragePopup'
import TaskSwitcherPopup from './components/popup/TaskSwitcherPopup'
import './index.css'

// Simple routing based on query parameter
function Router() {
  const params = new URLSearchParams(window.location.search)
  const popup = params.get('popup')
  
  switch (popup) {
    case 'storage':
      return <StoragePopup />
    case 'cpu':
      return <CpuPopup />
    case 'ram':
      return <RamPopup />
    case 'gpu':
      return <GpuPopup />
    case 'network':
      return <NetworkPopup />
    case 'audio':
      return <AudioPopup />
    case 'headset':
      return <HeadsetPopup />
    case 'media':
      return <MediaPopup />
    case 'settings':
      return <SettingsPopup />
    case 'power':
      return <PowerPopup />
    case 'notes':
      return <NotesPopup />
    case 'folders':
      return <FoldersPopup />
    case 'taskswitcher':
      return <TaskSwitcherPopup />
    case 'calendar':
      return <CalendarPopup />
    case 'dev-color':
      return <DevColorPopup />
    default:
      return <App />
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
)
