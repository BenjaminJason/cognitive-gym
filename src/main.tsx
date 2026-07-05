import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Dashboard from './pages/Dashboard'
import NBack from './pages/NBack'
import GoPage from './pages/GoPage'
import FermiPage from './pages/FermiPage'
import WeeklyPage from './pages/WeeklyPage'
import SettingsPage from './pages/SettingsPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/nback" element={<NBack />} />
        <Route path="/go" element={<GoPage />} />
        <Route path="/fermi" element={<FermiPage />} />
        <Route path="/weekly" element={<WeeklyPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
