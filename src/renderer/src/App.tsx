import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, createContext, useContext } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Faktury from './pages/Faktury'
import Koszty from './pages/Koszty'
import Podatek from './pages/Podatek'
import Kalkulator from './pages/Kalkulator'
import Raty from './pages/Raty'
import Asystent from './pages/Asystent'
import Ustawienia from './pages/Ustawienia'
import Wizard from './pages/Wizard'
import { ipc } from './lib/ipc'
import type { AppConfig } from './lib/types'
import { DEFAULT_CONFIG } from './lib/types'

/* ─── context ──────────────────────────────────────────── */

export interface AppContextValue {
  config: AppConfig
  setConfig: (c: AppConfig) => void
  saveConfig: (c: AppConfig) => Promise<void>
  configLoaded: boolean
  openWizard: () => void
}

export const AppContext = createContext<AppContextValue>({
  config: DEFAULT_CONFIG,
  setConfig: () => {},
  saveConfig: async () => {},
  configLoaded: false,
  openWizard: () => {}
})

export const useAppContext = () => useContext(AppContext)

/* ─── app ──────────────────────────────────────────────── */

export default function App() {
  const [config, setConfigState] = useState<AppConfig>(DEFAULT_CONFIG)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    ipc.getConfig()
      .then((c) => {
        // Migracja: uzupełnij pola dodane w nowych wersjach aplikacji
        const merged: AppConfig = {
          ...DEFAULT_CONFIG,
          ...c,
          installments: c.installments ?? [],
          hiddenExpenseIds: c.hiddenExpenseIds ?? [],
          geminiApiKey: c.geminiApiKey ?? ''
        }
        setConfigState(merged)
        setConfigLoaded(true)
        if (!merged.wizardCompleted) setShowWizard(true)
      })
      .catch(console.error)
  }, [])

  const saveConfig = async (c: AppConfig) => {
    await ipc.saveConfig(c)
    setConfigState(c)
  }

  const handleWizardComplete = (c: AppConfig) => {
    setConfigState(c)
    setShowWizard(false)
  }

  // Czekaj na załadowanie konfiguracji przed renderowaniem
  if (!configLoaded) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Ładowanie…</div>
      </div>
    )
  }

  if (showWizard) {
    return (
      <AppContext.Provider value={{
        config, setConfig: setConfigState, saveConfig, configLoaded,
        openWizard: () => setShowWizard(true)
      }}>
        <Wizard initialConfig={config} onComplete={handleWizardComplete} />
      </AppContext.Provider>
    )
  }

  return (
    <AppContext.Provider value={{
      config, setConfig: setConfigState, saveConfig, configLoaded,
      openWizard: () => setShowWizard(true)
    }}>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/faktury" element={<Faktury />} />
          <Route path="/koszty" element={<Koszty />} />
          <Route path="/podatek" element={<Podatek />} />
          <Route path="/kalkulator" element={<Kalkulator />} />
          <Route path="/raty" element={<Raty />} />
          <Route path="/asystent" element={<Asystent />} />
          <Route path="/ustawienia" element={<Ustawienia />} />
        </Routes>
      </Layout>
    </AppContext.Provider>
  )
}
