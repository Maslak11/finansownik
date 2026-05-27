import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Loader, Plus, Trash2, FolderOpen, Wand2 } from 'lucide-react'
import { useAppContext } from '../App'
import { ipc } from '../lib/ipc'
import type { AppConfig, FixedExpense, ConnectionStatus } from '../lib/types'

function genId() {
  return Math.random().toString(36).slice(2, 9)
}

function StatusBadge({ status, msg }: { status: ConnectionStatus; msg?: string }) {
  if (status === 'idle') return null
  if (status === 'testing') return <span className="flex items-center gap-1 text-slate-500 text-sm"><Loader size={14} className="animate-spin" /> Testowanie...</span>
  if (status === 'ok') return <span className="flex items-center gap-1 text-emerald-600 text-sm"><CheckCircle size={14} /> {msg || 'Połączono'}</span>
  return <span className="flex items-center gap-1 text-red-600 text-sm"><XCircle size={14} /> {msg || 'Błąd połączenia'}</span>
}

export default function Ustawienia() {
  const { config, saveConfig, openWizard } = useAppContext()
  const [draft, setDraft] = useState<AppConfig>(config)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [wfirmaStatus, setWfirmaStatus] = useState<ConnectionStatus>('idle')
  const [wfirmaMsg, setWfirmaMsg] = useState('')
  const [sheetsStatus, setSheetsStatus] = useState<ConnectionStatus>('idle')
  const [sheetsMsg, setSheetsMsg] = useState('')
  const [configPath, setConfigPath] = useState('')

  useEffect(() => {
    setDraft(config)
  }, [config])

  useEffect(() => {
    ipc.getConfigPath().then(setConfigPath).catch(() => {})
  }, [])

  function update<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function updateTax(field: keyof AppConfig['tax'], value: number) {
    setDraft((prev) => ({ ...prev, tax: { ...prev.tax, [field]: value } }))
  }

  function updateAllocation(field: keyof AppConfig['allocation'], value: number) {
    setDraft((prev) => ({ ...prev, allocation: { ...prev.allocation, [field]: value } }))
  }

  function addSubscription() {
    const entry: FixedExpense = { id: genId(), name: '', amount: 0 }
    setDraft((prev) => ({ ...prev, fixedExpenses: [...prev.fixedExpenses, entry] }))
  }

  function updateSubscription(id: string, field: keyof FixedExpense, value: string | number) {
    setDraft((prev) => ({
      ...prev,
      fixedExpenses: prev.fixedExpenses.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    }))
  }

  function removeSubscription(id: string) {
    setDraft((prev) => ({ ...prev, fixedExpenses: prev.fixedExpenses.filter((e) => e.id !== id) }))
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await saveConfig(draft)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function testWfirma() {
    setWfirmaStatus('testing')
    try {
      await ipc.testWfirma(draft.wfirma)
      setWfirmaStatus('ok')
      setWfirmaMsg('Połączono z wFirma')
    } catch (e) {
      setWfirmaStatus('error')
      setWfirmaMsg(String(e instanceof Error ? e.message : e))
    }
  }

  async function testSheets() {
    setSheetsStatus('testing')
    try {
      const title = await ipc.testSheets(draft.sheets)
      setSheetsStatus('ok')
      setSheetsMsg(`Arkusz: "${title}"`)
    } catch (e) {
      setSheetsStatus('error')
      setSheetsMsg(String(e instanceof Error ? e.message : e))
    }
  }

  async function initSheets() {
    setSheetsStatus('testing')
    try {
      await ipc.initSheets(draft.sheets)
      setSheetsStatus('ok')
      setSheetsMsg('Nagłówki arkusza utworzone')
    } catch (e) {
      setSheetsStatus('error')
      setSheetsMsg(String(e instanceof Error ? e.message : e))
    }
  }

  const totalFixed = draft.czynsz + draft.fixedExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Ustawienia</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-emerald-600 text-sm flex items-center gap-1"><CheckCircle size={14} /> Zapisano</span>}
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Zapisuję...' : 'Zapisz ustawienia'}
          </button>
        </div>
      </div>

      {/* wFirma */}
      <Section title="Integracja wFirma" hint="Access Key + Secret Key: Ustawienia → Bezpieczeństwo → Aplikacje → Klucze API. App Key: złóż wniosek na wfirma.pl/kontakt (#appKey) — otrzymasz e-mailem.">
        <div className="space-y-3">
          <Field label="Access Key">
            <input
              type="password"
              value={draft.wfirma.accessKey}
              onChange={(e) => update('wfirma', { ...draft.wfirma, accessKey: e.target.value })}
              placeholder="accessKey z wFirma"
              className="input font-mono"
            />
          </Field>
          <Field label="Secret Key">
            <input
              type="password"
              value={draft.wfirma.secretKey}
              onChange={(e) => update('wfirma', { ...draft.wfirma, secretKey: e.target.value })}
              placeholder="secretKey z wFirma"
              className="input font-mono"
            />
          </Field>
          <Field label="App Key" hint="Klucz aplikacji — otrzymasz od wFirma e-mailem po złożeniu wniosku na wfirma.pl/kontakt">
            <input
              type="password"
              value={draft.wfirma.appKey}
              onChange={(e) => update('wfirma', { ...draft.wfirma, appKey: e.target.value })}
              placeholder="appKey od wFirma"
              className="input font-mono"
            />
          </Field>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={testWfirma}
              disabled={wfirmaStatus === 'testing' || !draft.wfirma.accessKey}
              className="btn-secondary text-sm"
            >
              Testuj połączenie
            </button>
            <StatusBadge status={wfirmaStatus} msg={wfirmaMsg} />
          </div>
        </div>
      </Section>

      {/* Google Sheets */}
      <Section title="Google Sheets" hint="Utwórz Service Account w Google Cloud Console i udostępnij arkusz jego adresowi email.">
        <div className="space-y-3">
          <Field label="ID arkusza Google Sheets">
            <input
              type="text"
              value={draft.sheets.spreadsheetId}
              onChange={(e) => update('sheets', { ...draft.sheets, spreadsheetId: e.target.value })}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              className="input font-mono text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">ID z URL arkusza: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit</p>
          </Field>
          <Field label="Service Account JSON">
            <textarea
              value={draft.sheets.serviceAccountJson}
              onChange={(e) => update('sheets', { ...draft.sheets, serviceAccountJson: e.target.value })}
              placeholder='Wklej zawartość pliku JSON z Google Cloud Console ({"type": "service_account", ...})'
              className="input font-mono text-xs h-28 resize-none"
            />
          </Field>
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <button
              onClick={testSheets}
              disabled={sheetsStatus === 'testing' || !draft.sheets.spreadsheetId}
              className="btn-secondary text-sm"
            >
              Testuj połączenie
            </button>
            <button
              onClick={initSheets}
              disabled={sheetsStatus === 'testing' || !draft.sheets.spreadsheetId}
              className="btn-ghost text-sm"
            >
              Utwórz nagłówki arkusza
            </button>
            <StatusBadge status={sheetsStatus} msg={sheetsMsg} />
          </div>
        </div>
      </Section>

      {/* Podatki */}
      <Section title="Podatki i ZUS" hint="Wartości domyślne dla podatku liniowego i pełnego ZUS 2025.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Stawka PIT (%)">
            <NumInput
              value={draft.tax.pitRate * 100}
              onChange={(v) => updateTax('pitRate', v / 100)}
              step={1}
              suffix="%"
            />
          </Field>
          <Field label="ZUS społeczne (zł/mies.)">
            <NumInput
              value={draft.tax.zusSpołeczne}
              onChange={(v) => updateTax('zusSpołeczne', v)}
              step={1}
              suffix="zł"
            />
          </Field>
          <Field label="Składka zdrowotna (% dochodu)">
            <NumInput
              value={draft.tax.zusZdrowotnaRate * 100}
              onChange={(v) => updateTax('zusZdrowotnaRate', v / 100)}
              step={0.1}
              suffix="%"
            />
          </Field>
          <Field label="Minimalna składka zdrowotna (zł)">
            <NumInput
              value={draft.tax.zusZdrowotnaMin}
              onChange={(v) => updateTax('zusZdrowotnaMin', v)}
              step={1}
              suffix="zł"
            />
          </Field>
        </div>
      </Section>

      {/* Koperty */}
      <Section title="Podział faktury — koperty" hint="Procenty liczone od kwoty netto faktury.">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Konto domowe (% netto)">
            <NumInput value={draft.allocation.dom} onChange={(v) => updateAllocation('dom', v)} step={1} suffix="%" />
          </Field>
          <Field label="Inwestycje / sprzęt (% netto)">
            <NumInput value={draft.allocation.inwestycje} onChange={(v) => updateAllocation('inwestycje', v)} step={1} suffix="%" />
          </Field>
          <Field label="Śr. liczba faktur / miesiąc">
            <NumInput
              value={draft.allocation.avgInvoicesPerMonth}
              onChange={(v) => updateAllocation('avgInvoicesPerMonth', v)}
              step={1}
              suffix="szt."
            />
            <p className="text-xs text-slate-400 mt-1">Używane do rozłożenia stałych kosztów (ZUS, czynsz) na faktury.</p>
          </Field>
        </div>
      </Section>

      {/* Stałe opłaty */}
      <Section
        title="Stałe opłaty miesięczne"
        hint={`Łącznie: ${(totalFixed).toLocaleString('pl-PL')} zł/mies. Rozkładane proporcjonalnie na faktury.`}
      >
        <div className="space-y-3">
          <Field label="Czynsz / najem (zł/mies.)">
            <NumInput value={draft.czynsz} onChange={(v) => update('czynsz', v)} step={50} suffix="zł" />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Subskrypcje i inne opłaty stałe</label>
              <button onClick={addSubscription} className="btn-ghost text-xs flex items-center gap-1 py-1">
                <Plus size={13} /> Dodaj opłatę
              </button>
            </div>
            <div className="space-y-2">
              {draft.fixedExpenses.map((e) => (
                <div key={e.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Nazwa (np. GitHub, Adobe, Spotify Business)"
                    value={e.name}
                    onChange={(ev) => updateSubscription(e.id, 'name', ev.target.value)}
                    className="input flex-1"
                  />
                  <div className="relative w-32">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={e.amount || ''}
                      onChange={(ev) => updateSubscription(e.id, 'amount', parseFloat(ev.target.value) || 0)}
                      className="input pr-7 text-right"
                    />
                    <span className="absolute right-2.5 top-2.5 text-slate-400 text-sm">zł</span>
                  </div>
                  <button onClick={() => removeSubscription(e.id)} className="btn-ghost p-2 text-slate-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {draft.fixedExpenses.length === 0 && (
                <p className="text-sm text-slate-400 py-2">Brak dodanych opłat. Kliknij "Dodaj opłatę".</p>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* Asystent AI — Gemini */}
      <Section title="Asystent AI (Gemini)" hint="Klucz API do Google Gemini — bezpłatnie na aistudio.google.com → Get API key. Używany przez zakładkę Asystent AI.">
        <Field label="Gemini API Key">
          <input
            type="password"
            value={draft.geminiApiKey ?? ''}
            onChange={(e) => update('geminiApiKey', e.target.value)}
            placeholder="AIzaSy..."
            className="input font-mono"
          />
          <p className="text-xs text-slate-400 mt-1">
            Darmowy tier: ~1 500 zapytań/dzień. Klucz przechowywany lokalnie.
          </p>
        </Field>
      </Section>

      {/* Ścieżka pliku konfiguracji */}
      {configPath && (
        <div className="card p-4 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <FolderOpen size={13} />
            Konfiguracja lokalna: <code className="font-mono bg-slate-200 px-1 rounded">{configPath}</code>
          </span>
        </div>
      )}

      {/* Kreator */}
      <div className="card p-5 border-dashed border-2 border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-700">Kreator konfiguracji</p>
            <p className="text-sm text-slate-400 mt-0.5">Przeprowadzi Cię przez wszystkie ustawienia krok po kroku.</p>
          </div>
          <button onClick={openWizard} className="btn-secondary flex items-center gap-2">
            <Wand2 size={15} />
            Uruchom kreator
          </button>
        </div>
      </div>

      <div className="flex justify-end pb-4">
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Zapisuję...' : 'Zapisz ustawienia'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-800 mb-1">{title}</h2>
      {hint && <p className="text-xs text-slate-400 mb-4">{hint}</p>}
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function NumInput({ value, onChange, step = 1, suffix }: {
  value: number
  onChange: (v: number) => void
  step?: number
  suffix?: string
}) {
  return (
    <div className="relative">
      <input
        type="number"
        step={step}
        min={0}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className={`input ${suffix ? 'pr-10' : ''} text-right`}
      />
      {suffix && <span className="absolute right-3 top-2.5 text-slate-400 text-sm">{suffix}</span>}
    </div>
  )
}
