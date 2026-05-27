import { useState } from 'react'
import {
  CheckCircle, XCircle, Loader, Plus, Trash2,
  ChevronRight, ChevronLeft, Zap, Database,
  FileText, PiggyBank, Home, Star
} from 'lucide-react'
import { ipc } from '../lib/ipc'
import type { AppConfig, FixedExpense, ConnectionStatus } from '../lib/types'
import { DEFAULT_CONFIG } from '../lib/types'

/* ─── helpers ─────────────────────────────────────────── */

function genId() { return Math.random().toString(36).slice(2, 9) }

function StatusBadge({ status, msg }: { status: ConnectionStatus; msg?: string }) {
  if (status === 'idle') return null
  if (status === 'testing')
    return <span className="flex items-center gap-1.5 text-slate-500 text-sm"><Loader size={14} className="animate-spin" />Sprawdzam…</span>
  if (status === 'ok')
    return <span className="flex items-center gap-1.5 text-emerald-600 text-sm"><CheckCircle size={14} />{msg || 'Połączono'}</span>
  return <span className="flex items-center gap-1.5 text-red-600 text-sm"><XCircle size={14} />{msg || 'Błąd'}</span>
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

function NumInput({ value, onChange, step = 1, suffix, min = 0 }: {
  value: number; onChange: (v: number) => void; step?: number; suffix?: string; min?: number
}) {
  return (
    <div className="relative">
      <input
        type="number" step={step} min={min} value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className={`input ${suffix ? 'pr-10' : ''} text-right`}
      />
      {suffix && <span className="absolute right-3 top-2.5 text-slate-400 text-sm">{suffix}</span>}
    </div>
  )
}

/* ─── step definitions ────────────────────────────────── */

const STEPS = [
  { id: 'welcome',    label: 'Witaj',         icon: Star },
  { id: 'wfirma',    label: 'wFirma',         icon: FileText },
  { id: 'sheets',    label: 'Google Sheets',  icon: Database },
  { id: 'taxes',     label: 'Podatki & ZUS',  icon: Zap },
  { id: 'koperty',   label: 'Koperty',        icon: PiggyBank },
  { id: 'expenses',  label: 'Stałe opłaty',   icon: Home },
  { id: 'done',      label: 'Gotowe!',        icon: CheckCircle },
]

/* ─── main component ──────────────────────────────────── */

interface Props {
  initialConfig: AppConfig
  onComplete: (config: AppConfig) => void
}

export default function Wizard({ initialConfig, onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<AppConfig>({ ...DEFAULT_CONFIG, ...initialConfig })

  /* wFirma */
  const [wfStatus, setWfStatus] = useState<ConnectionStatus>('idle')
  const [wfMsg, setWfMsg]       = useState('')

  /* Sheets */
  const [shStatus, setShStatus] = useState<ConnectionStatus>('idle')
  const [shMsg, setShMsg]       = useState('')

  const totalSteps = STEPS.length

  function next() { setStep(s => Math.min(s + 1, totalSteps - 1)) }
  function back() { setStep(s => Math.max(s - 1, 0)) }

  function updateWfirma(field: keyof AppConfig['wfirma'], val: string) {
    setDraft(d => ({ ...d, wfirma: { ...d.wfirma, [field]: val } }))
    setWfStatus('idle')
  }
  function updateSheets(field: keyof AppConfig['sheets'], val: string) {
    setDraft(d => ({ ...d, sheets: { ...d.sheets, [field]: val } }))
    setShStatus('idle')
  }
  function updateTax(field: keyof AppConfig['tax'], val: number) {
    setDraft(d => ({ ...d, tax: { ...d.tax, [field]: val } }))
  }
  function updateAlloc(field: keyof AppConfig['allocation'], val: number) {
    setDraft(d => ({ ...d, allocation: { ...d.allocation, [field]: val } }))
  }
  function addSub() {
    const e: FixedExpense = { id: genId(), name: '', amount: 0 }
    setDraft(d => ({ ...d, fixedExpenses: [...d.fixedExpenses, e] }))
  }
  function updateSub(id: string, field: keyof FixedExpense, val: string | number) {
    setDraft(d => ({ ...d, fixedExpenses: d.fixedExpenses.map(e => e.id === id ? { ...e, [field]: val } : e) }))
  }
  function removeSub(id: string) {
    setDraft(d => ({ ...d, fixedExpenses: d.fixedExpenses.filter(e => e.id !== id) }))
  }

  async function testWfirma() {
    setWfStatus('testing')
    try {
      await ipc.testWfirma(draft.wfirma)
      setWfStatus('ok'); setWfMsg('Połączono z wFirma ✓')
    } catch (e) {
      setWfStatus('error'); setWfMsg(String(e instanceof Error ? e.message : e))
    }
  }

  async function testSheets() {
    setShStatus('testing')
    try {
      const title = await ipc.testSheets(draft.sheets)
      setShStatus('ok'); setShMsg(`Arkusz: „${title}"`)
    } catch (e) {
      setShStatus('error'); setShMsg(String(e instanceof Error ? e.message : e))
    }
  }

  async function initSheets() {
    setShStatus('testing')
    try {
      await ipc.initSheets(draft.sheets)
      setShStatus('ok'); setShMsg('Nagłówki arkusza utworzone ✓')
    } catch (e) {
      setShStatus('error'); setShMsg(String(e instanceof Error ? e.message : e))
    }
  }

  async function finish() {
    const final: AppConfig = { ...draft, wizardCompleted: true }
    await ipc.saveConfig(final)
    onComplete(final)
  }

  const progress = (step / (totalSteps - 1)) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">finansownik</h1>
          <p className="text-slate-400 mt-1 text-sm">Kreator konfiguracji — krok {step + 1} z {totalSteps}</p>
        </div>

        {/* Step pills */}
        <div className="flex items-center justify-center gap-1 mb-6 flex-wrap">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                i === step
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                  : i < step
                  ? 'bg-emerald-500/20 text-emerald-400 cursor-pointer hover:bg-emerald-500/30'
                  : 'bg-slate-700 text-slate-500 cursor-default'
              }`}
            >
              {i < step
                ? <CheckCircle size={11} />
                : <s.icon size={11} />}
              {s.label}
            </button>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-700 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-sky-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-8">

            {/* ── Krok 0: Witaj ── */}
            {step === 0 && (
              <div className="text-center space-y-5">
                <div className="w-16 h-16 bg-sky-100 rounded-2xl flex items-center justify-center mx-auto">
                  <Star size={32} className="text-sky-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Witaj w finansowniku!</h2>
                  <p className="text-slate-500 mt-2 max-w-md mx-auto">
                    Ten kreator przeprowadzi Cię przez konfigurację w kilku krokach.
                    Możesz pominąć kroki i uzupełnić je później w Ustawieniach.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-left max-w-md mx-auto">
                  {[
                    { icon: FileText,   label: 'wFirma API',        desc: 'automatyczny odczyt faktur i kosztów' },
                    { icon: Database,   label: 'Google Sheets',     desc: 'historia alokacji i konfiguracja w chmurze' },
                    { icon: Zap,        label: 'Podatki & ZUS',     desc: 'precyzyjne wyliczenia zaliczek PIT' },
                    { icon: PiggyBank,  label: 'Koperty',           desc: 'automatyczny podział każdej faktury' },
                  ].map(({ icon: Icon, label, desc }) => (
                    <div key={label} className="flex items-start gap-2.5 bg-slate-50 rounded-xl p-3">
                      <div className="w-7 h-7 bg-sky-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon size={14} className="text-sky-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{label}</p>
                        <p className="text-xs text-slate-500">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Krok 1: wFirma ── */}
            {step === 1 && (
              <div className="space-y-5">
                <StepHeader icon={FileText} title="Integracja z wFirma" color="sky"
                  desc="Dzięki temu aplikacja automatycznie pobierze faktury sprzedaży i koszty z Twojego konta wFirma." />

                <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 text-sm text-sky-800">
                  <p className="font-medium mb-1">Gdzie znaleźć klucze API?</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-sky-700">
                    <li>Zaloguj się na <strong>app.wfirma.pl</strong></li>
                    <li>Przejdź do <strong>Ustawienia → Bezpieczeństwo → Aplikacje</strong></li>
                    <li>Kliknij <strong>Klucze API</strong> i wygeneruj nowy zestaw</li>
                  </ol>
                </div>

                <div className="space-y-3">
                  <Field label="Access Key">
                    <input type="password" className="input font-mono"
                      placeholder="accessKey…"
                      value={draft.wfirma.accessKey}
                      onChange={e => updateWfirma('accessKey', e.target.value)} />
                  </Field>
                  <Field label="Secret Key">
                    <input type="password" className="input font-mono"
                      placeholder="secretKey…"
                      value={draft.wfirma.secretKey}
                      onChange={e => updateWfirma('secretKey', e.target.value)} />
                  </Field>
                  <Field label="App Key">
                    <input type="password" className="input font-mono"
                      placeholder="appKey…"
                      value={draft.wfirma.appKey}
                      onChange={e => updateWfirma('appKey', e.target.value)} />
                  </Field>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={testWfirma}
                    disabled={wfStatus === 'testing' || !draft.wfirma.accessKey}
                    className="btn-secondary"
                  >
                    Testuj połączenie
                  </button>
                  <StatusBadge status={wfStatus} msg={wfMsg} />
                </div>
              </div>
            )}

            {/* ── Krok 2: Google Sheets ── */}
            {step === 2 && (
              <div className="space-y-5">
                <StepHeader icon={Database} title="Google Sheets jako baza danych" color="emerald"
                  desc="Aplikacja zapisuje historię alokacji i konfigurację do Twojego arkusza Google." />

                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-sm text-emerald-800">
                  <p className="font-medium mb-1">Jak skonfigurować Service Account?</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-emerald-700">
                    <li>Wejdź na <strong>console.cloud.google.com</strong> → utwórz projekt</li>
                    <li>Włącz <strong>Google Sheets API</strong> w bibliotece API</li>
                    <li><strong>IAM &amp; Admin → Service Accounts</strong> → utwórz nowe</li>
                    <li>Zakładka <strong>Keys → Add Key → JSON</strong> → pobierz plik</li>
                    <li>Otwórz arkusz Google i <strong>udostępnij</strong> go adresowi email z JSON-a</li>
                  </ol>
                </div>

                <Field label="ID arkusza Google Sheets"
                  hint="Skopiuj z URL: docs.google.com/spreadsheets/d/⟨TU_JEST_ID⟩/edit">
                  <input type="text" className="input font-mono text-sm"
                    placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                    value={draft.sheets.spreadsheetId}
                    onChange={e => updateSheets('spreadsheetId', e.target.value)} />
                </Field>

                <Field label="Zawartość pliku Service Account JSON">
                  <textarea className="input font-mono text-xs h-32 resize-none"
                    placeholder={'{\n  "type": "service_account",\n  "project_id": "...",\n  "client_email": "...",\n  ...\n}'}
                    value={draft.sheets.serviceAccountJson}
                    onChange={e => updateSheets('serviceAccountJson', e.target.value)} />
                </Field>

                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={testSheets}
                    disabled={shStatus === 'testing' || !draft.sheets.spreadsheetId}
                    className="btn-secondary">
                    Testuj połączenie
                  </button>
                  <button onClick={initSheets}
                    disabled={shStatus === 'testing' || !draft.sheets.spreadsheetId}
                    className="btn-ghost text-sm">
                    Utwórz nagłówki arkusza
                  </button>
                  <StatusBadge status={shStatus} msg={shMsg} />
                </div>
              </div>
            )}

            {/* ── Krok 3: Podatki & ZUS ── */}
            {step === 3 && (
              <div className="space-y-5">
                <StepHeader icon={Zap} title="Podatki i ZUS" color="amber"
                  desc="Domyślne wartości są ustawione dla podatku liniowego 19% i pełnego ZUS 2025. Zmień je, jeśli Twoja sytuacja jest inna." />

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Stawka PIT (%)">
                    <NumInput value={draft.tax.pitRate * 100}
                      onChange={v => updateTax('pitRate', v / 100)} step={1} suffix="%" />
                  </Field>
                  <Field label="ZUS społeczne (zł/mies.)"
                    hint="Składki emerytalna, rentowa, chorobowa, wypadkowa">
                    <NumInput value={draft.tax.zusSpołeczne}
                      onChange={v => updateTax('zusSpołeczne', v)} step={1} suffix="zł" />
                  </Field>
                  <Field label="Składka zdrowotna (% dochodu)"
                    hint="Dla podatku liniowego: 4,9%">
                    <NumInput value={draft.tax.zusZdrowotnaRate * 100}
                      onChange={v => updateTax('zusZdrowotnaRate', v / 100)} step={0.1} suffix="%" />
                  </Field>
                  <Field label="Minimalna składka zdrowotna (zł)"
                    hint="Dolna granica niezależna od dochodu">
                    <NumInput value={draft.tax.zusZdrowotnaMin}
                      onChange={v => updateTax('zusZdrowotnaMin', v)} step={1} suffix="zł" />
                  </Field>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                  <strong>Przykład:</strong> dochód 8 000 zł → ZUS społeczne {draft.tax.zusSpołeczne} zł odliczone od podstawy →
                  podatek od {Math.max(0, 8000 - draft.tax.zusSpołeczne).toLocaleString('pl-PL')} zł =&nbsp;
                  <strong>{Math.round(Math.max(0, 8000 - draft.tax.zusSpołeczne) * draft.tax.pitRate).toLocaleString('pl-PL')} zł</strong>
                </div>
              </div>
            )}

            {/* ── Krok 4: Koperty ── */}
            {step === 4 && (
              <div className="space-y-5">
                <StepHeader icon={PiggyBank} title="Podział faktury — koperty" color="violet"
                  desc="Ustaw, ile procent z każdej faktury (netto) ma być odkładane na poszczególne koperty." />

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Konto domowe (% netto)"
                    hint="Przelew na wspólne konto domowe / na życie">
                    <NumInput value={draft.allocation.dom}
                      onChange={v => updateAlloc('dom', v)} step={1} suffix="%" />
                  </Field>
                  <Field label="Inwestycje / sprzęt (% netto)"
                    hint="Rezerwa na zakupy sprzętu i inne inwestycje">
                    <NumInput value={draft.allocation.inwestycje}
                      onChange={v => updateAlloc('inwestycje', v)} step={1} suffix="%" />
                  </Field>
                  <Field label="Śr. liczba faktur miesięcznie"
                    hint="Do proporcjonalnego rozłożenia ZUS i stałych opłat na faktury">
                    <NumInput value={draft.allocation.avgInvoicesPerMonth}
                      onChange={v => updateAlloc('avgInvoicesPerMonth', Math.max(1, v))} step={1} suffix="szt." min={1} />
                  </Field>
                </div>

                {/* Podgląd na żywo */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 mb-3">Podgląd podziału dla faktury 10 000 zł netto</p>
                  <PreviewAlloc config={draft} />
                </div>
              </div>
            )}

            {/* ── Krok 5: Stałe opłaty ── */}
            {step === 5 && (
              <div className="space-y-5">
                <StepHeader icon={Home} title="Stałe opłaty miesięczne" color="rose"
                  desc="Czynsz i subskrypcje będą automatycznie rozdzielane proporcjonalnie na każdą fakturę." />

                <Field label="Czynsz / najem mieszkania lub biura (zł/mies.)">
                  <NumInput value={draft.czynsz}
                    onChange={v => setDraft(d => ({ ...d, czynsz: v }))} step={50} suffix="zł" />
                </Field>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Subskrypcje i inne stałe opłaty</label>
                    <button onClick={addSub} className="btn-ghost text-xs flex items-center gap-1 py-1">
                      <Plus size={13} /> Dodaj pozycję
                    </button>
                  </div>

                  <div className="space-y-2">
                    {draft.fixedExpenses.map(e => (
                      <div key={e.id} className="flex items-center gap-2">
                        <input type="text"
                          placeholder="Nazwa (np. GitHub, Adobe CC, Notion)"
                          value={e.name}
                          onChange={ev => updateSub(e.id, 'name', ev.target.value)}
                          className="input flex-1" />
                        <div className="relative w-28 flex-shrink-0">
                          <input type="number" min={0} step={1}
                            value={e.amount || ''}
                            onChange={ev => updateSub(e.id, 'amount', parseFloat(ev.target.value) || 0)}
                            className="input pr-7 text-right" />
                          <span className="absolute right-2.5 top-2.5 text-slate-400 text-sm">zł</span>
                        </div>
                        <button onClick={() => removeSub(e.id)}
                          className="btn-ghost p-2 text-slate-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {draft.fixedExpenses.length === 0 && (
                      <p className="text-sm text-slate-400 py-1">Brak pozycji. Kliknij "Dodaj pozycję".</p>
                    )}
                  </div>

                  {(draft.czynsz > 0 || draft.fixedExpenses.length > 0) && (
                    <p className="text-xs text-slate-500 mt-3">
                      Łącznie stałe opłaty:&nbsp;
                      <strong className="text-slate-700">
                        {(draft.czynsz + draft.fixedExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)).toLocaleString('pl-PL')} zł/mies.
                      </strong>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Krok 6: Gotowe ── */}
            {step === 6 && (
              <div className="text-center space-y-5">
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
                  <CheckCircle size={32} className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Wszystko gotowe!</h2>
                  <p className="text-slate-500 mt-2">Twoja konfiguracja zostanie zapisana. Możesz ją zmienić w każdej chwili w Ustawieniach.</p>
                </div>

                <div className="bg-slate-50 rounded-xl p-4 text-left text-sm space-y-2 max-w-sm mx-auto">
                  <SummaryRow label="wFirma API" ok={!!draft.wfirma.accessKey} />
                  <SummaryRow label="Google Sheets" ok={!!draft.sheets.spreadsheetId} />
                  <SummaryRow label={`PIT ${(draft.tax.pitRate * 100).toFixed(0)}% · ZUS ${draft.tax.zusSpołeczne.toLocaleString('pl-PL')} zł`} ok={true} />
                  <SummaryRow label={`Dom ${draft.allocation.dom}% · Inwestycje ${draft.allocation.inwestycje}%`} ok={true} />
                  {(draft.czynsz > 0 || draft.fixedExpenses.length > 0) && (
                    <SummaryRow label={`Stałe opłaty ${(draft.czynsz + draft.fixedExpenses.reduce((s, e) => s + e.amount, 0)).toLocaleString('pl-PL')} zł/mies.`} ok={true} />
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={back}
              disabled={step === 0}
              className="btn-ghost flex items-center gap-1.5 disabled:opacity-0"
            >
              <ChevronLeft size={16} /> Wstecz
            </button>

            <span className="text-xs text-slate-400">
              {step + 1} / {totalSteps}
            </span>

            {step < totalSteps - 1 ? (
              <button onClick={next} className="btn-primary flex items-center gap-1.5">
                {step === 0 ? 'Zaczynamy' : 'Dalej'} <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={finish} className="btn-primary flex items-center gap-1.5">
                <CheckCircle size={16} /> Przejdź do aplikacji
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-4">
          Możesz pominąć dowolny krok — uzupełnisz go później w Ustawieniach.
        </p>
      </div>
    </div>
  )
}

/* ─── pomocnicze komponenty ───────────────────────────── */

function StepHeader({ icon: Icon, title, desc, color }: {
  icon: React.ElementType; title: string; desc: string; color: string
}) {
  const bg: Record<string, string> = {
    sky: 'bg-sky-100', emerald: 'bg-emerald-100', amber: 'bg-amber-100',
    violet: 'bg-violet-100', rose: 'bg-rose-100'
  }
  const fg: Record<string, string> = {
    sky: 'text-sky-600', emerald: 'text-emerald-600', amber: 'text-amber-600',
    violet: 'text-violet-600', rose: 'text-rose-600'
  }
  return (
    <div className="flex items-start gap-4">
      <div className={`w-10 h-10 ${bg[color]} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon size={20} className={fg[color]} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
      </div>
    </div>
  )
}

function SummaryRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok
        ? <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
        : <XCircle size={14} className="text-slate-300 flex-shrink-0" />}
      <span className={ok ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
    </div>
  )
}

/* Podgląd podziału koperty na żywo */
function PreviewAlloc({ config }: { config: AppConfig }) {
  const netto = 10000
  const avg = Math.max(1, config.allocation.avgInvoicesPerMonth)
  const zus = (config.tax.zusSpołeczne + Math.max(config.tax.zusZdrowotnaMin, netto * config.tax.zusZdrowotnaRate)) / avg
  const podatek = Math.max(0, netto - config.tax.zusSpołeczne / avg) * config.tax.pitRate
  const czynsz = config.czynsz / avg
  const subs = config.fixedExpenses.reduce((s, e) => s + e.amount, 0) / avg
  const dom = netto * (config.allocation.dom / 100)
  const inw = netto * (config.allocation.inwestycje / 100)
  const rest = Math.max(0, netto - podatek - zus - czynsz - subs - dom - inw)

  const rows = [
    { label: 'Podatek PIT',    val: podatek, color: 'bg-red-400' },
    { label: 'ZUS',            val: zus,     color: 'bg-orange-400' },
    { label: 'Dom',            val: dom,     color: 'bg-blue-400' },
    { label: 'Inwestycje',     val: inw,     color: 'bg-emerald-400' },
    { label: 'Do dyspozycji',  val: rest,    color: 'bg-slate-300' },
  ].filter(r => r.val > 0)

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
        {rows.map(r => (
          <div key={r.label} className={`${r.color}`} style={{ width: `${(r.val / netto) * 100}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className={`w-2 h-2 rounded-full ${r.color}`} />
              {r.label}
            </span>
            <span className="font-medium text-slate-700 tabular-nums">
              {r.val.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} zł
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
