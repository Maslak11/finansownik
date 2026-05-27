import { useState, useEffect, useRef } from 'react'
import {
  RefreshCw, Save, ChevronDown, ChevronRight, AlertCircle,
  CheckCircle, Plus, Upload, Trash2, X, FileText
} from 'lucide-react'
import { useAppContext } from '../App'
import { ipc } from '../lib/ipc'
import { allocateInvoice } from '../lib/allocator'
import KopertaBar from '../components/KopertaBar'
import type { Invoice, InvoiceAllocation } from '../lib/types'

/* ─── helpers ───────────────────────────────────────── */
function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function thisMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
function monthRange(ym: string) {
  const [y, m] = ym.split('-')
  return { dateFrom: `${y}-${m}-01`, dateTo: `${y}-${m}-31` }
}
function genId() {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/* ─── Invoice form modal ────────────────────────────── */
interface InvoiceFormProps {
  initial?: Partial<Invoice>
  onSave: (inv: Invoice) => void
  onClose: () => void
}

const VAT_RATES = [
  { label: '23%', value: 0.23 },
  { label: '8%', value: 0.08 },
  { label: '5%', value: 0.05 },
  { label: '0%', value: 0 },
]

function InvoiceModal({ initial, onSave, onClose }: InvoiceFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(initial?.date ?? today)
  const [number, setNumber] = useState(initial?.number ?? '')
  const [clientName, setClientName] = useState(initial?.clientName ?? '')
  const [netto, setNetto] = useState(initial?.nettoAmount?.toString() ?? '')
  const [vatRate, setVatRate] = useState(0.23)
  const [paid, setPaid] = useState(initial?.paid ?? false)

  const nettoNum = parseFloat(netto.replace(',', '.')) || 0
  const vatAmt = Math.round(nettoNum * vatRate * 100) / 100
  const brutto = Math.round((nettoNum + vatAmt) * 100) / 100

  function handleSave() {
    if (nettoNum <= 0) return
    onSave({
      id: initial?.id ?? genId(),
      date,
      number: number || `FV/${date}`,
      clientName,
      nettoAmount: nettoNum,
      vatAmount: vatAmt,
      bruttoAmount: brutto,
      paid
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">
            {initial?.id ? 'Edytuj fakturę' : 'Nowa faktura'}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data wystawienia</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Numer faktury</label>
              <input type="text" placeholder="FV/01/2025" value={number}
                onChange={e => setNumber(e.target.value)} className="input" />
            </div>
          </div>

          <div>
            <label className="label">Kontrahent</label>
            <input type="text" placeholder="Nazwa firmy / osoby"
              value={clientName} onChange={e => setClientName(e.target.value)} className="input" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Kwota netto (zł)</label>
              <input type="text" inputMode="decimal" placeholder="0.00"
                value={netto} onChange={e => setNetto(e.target.value)} className="input text-right" />
            </div>
            <div>
              <label className="label">Stawka VAT</label>
              <select value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value))} className="input">
                {VAT_RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {nettoNum > 0 && (
            <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm flex justify-between">
              <span className="text-slate-500">VAT {vatAmt > 0 ? fmt(vatAmt) : '0'} zł → Brutto</span>
              <span className="font-semibold text-slate-800">{fmt(brutto)} zł</span>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)}
              className="w-4 h-4 accent-sky-600" />
            <span className="text-sm text-slate-700">Faktura opłacona</span>
          </label>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="btn-secondary">Anuluj</button>
          <button onClick={handleSave} disabled={nettoNum <= 0} className="btn-primary">
            Zapisz fakturę
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Invoice row ───────────────────────────────────── */
function InvoiceRow({
  invoice, allocation, expanded, onToggle, onSaveToSheets, onDelete, isSaving, hasSheets, isManual
}: {
  invoice: Invoice
  allocation: InvoiceAllocation | undefined
  expanded: boolean
  onToggle: () => void
  onSaveToSheets: () => void
  onDelete?: () => void
  isSaving: boolean
  hasSheets: boolean
  isManual?: boolean
}) {
  return (
    <div>
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 select-none"
        onClick={onToggle}
      >
        <span className="text-slate-400">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-800">{invoice.number}</span>
            {isManual && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">ręczna</span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded ${invoice.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {invoice.paid ? 'opłacona' : 'oczekuje'}
            </span>
            {allocation?.savedToSheets && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <CheckCircle size={12} className="text-emerald-500" /> w Sheets
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{invoice.clientName || '—'} · {invoice.date}</p>
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
          <div className="text-right">
            <p className="font-bold text-slate-800">{fmt(invoice.nettoAmount)} zł</p>
            <p className="text-xs text-slate-400">netto</p>
          </div>
        </div>
      </div>

      {expanded && allocation && (
        <div className="px-5 pb-5 bg-slate-50 border-t border-slate-100">
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Podział na koperty</h3>
              {hasSheets && !allocation.savedToSheets && (
                <button
                  onClick={onSaveToSheets}
                  disabled={isSaving}
                  className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
                >
                  <Save size={12} />
                  {isSaving ? 'Zapisuję...' : 'Zapisz do Sheets'}
                </button>
              )}
            </div>
            <KopertaBar koperty={allocation.koperty} total={invoice.nettoAmount} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Main component ────────────────────────────────── */
type Tab = 'wfirma' | 'manual'

export default function Faktury() {
  const { config } = useAppContext()
  const [tab, setTab] = useState<Tab>('wfirma')
  const [month, setMonth] = useState(thisMonth())

  // wFirma data
  const [wfInvoices, setWfInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<number>(0)
  const [wfLoading, setWfLoading] = useState(false)
  const [wfError, setWfError] = useState('')

  // Manual data
  const [manualInvoices, setManualInvoices] = useState<Invoice[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Invoice | undefined>()
  const [csvError, setCsvError] = useState('')
  const [csvSuccess, setCsvSuccess] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Shared
  const [allocations, setAllocations] = useState<Map<string, InvoiceAllocation>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)

  const hasWfirma = !!config.wfirma.accessKey
  const hasSheets = !!config.sheets.spreadsheetId

  // Ładuj manualne przy starcie
  useEffect(() => {
    ipc.getManualInvoices().then(setManualInvoices).catch(() => {})
  }, [])

  // Ładuj wFirma przy zmianie miesiąca
  useEffect(() => {
    if (hasWfirma) loadWfirma()
  }, [month, hasWfirma])

  // Przelicz alokacje gdy zmieniają się faktury lub konfiguracja
  useEffect(() => {
    const invoices = tab === 'wfirma' ? wfInvoices : manualMonthInvoices
    const totalRev = invoices.reduce((s, i) => s + i.nettoAmount, 0)
    const map = new Map<string, InvoiceAllocation>()
    for (const inv of invoices) {
      map.set(inv.id, allocateInvoice({
        invoice: inv, totalMonthRevenue: totalRev,
        totalMonthExpenses: expenses, config
      }))
    }
    setAllocations(map)
  }, [wfInvoices, manualInvoices, tab, month, config])

  async function loadWfirma() {
    setWfLoading(true); setWfError('')
    try {
      const r = monthRange(month)
      const [inv, exp] = await Promise.all([
        ipc.getInvoices(config.wfirma, r.dateFrom, r.dateTo),
        ipc.getExpenses(config.wfirma, r.dateFrom, r.dateTo)
      ])
      setWfInvoices(inv)
      setExpenses(exp.reduce((s, e) => s + e.nettoAmount, 0))
    } catch (e) {
      setWfError(String(e instanceof Error ? e.message : e))
    } finally {
      setWfLoading(false)
    }
  }

  async function handleSaveManual(invoice: Invoice) {
    await ipc.saveManualInvoice(invoice)
    const updated = await ipc.getManualInvoices()
    setManualInvoices(updated)
    setShowForm(false)
    setEditInvoice(undefined)
  }

  async function handleDeleteManual(id: string) {
    await ipc.deleteManualInvoice(id)
    setManualInvoices(prev => prev.filter(i => i.id !== id))
  }

  async function handleSaveAllocation(invoiceId: string) {
    if (!hasSheets) return
    const alloc = allocations.get(invoiceId)
    if (!alloc) return
    setSaving(invoiceId)
    try {
      await ipc.saveAllocation(config.sheets, alloc)
      setAllocations(prev => {
        const next = new Map(prev)
        next.set(invoiceId, { ...alloc, savedToSheets: true })
        return next
      })
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(null)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError(''); setCsvSuccess('')
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      try {
        const count = await ipc.importCSV(text)
        const updated = await ipc.getManualInvoices()
        setManualInvoices(updated)
        setCsvSuccess(`Zaimportowano ${count} faktur.`)
        setTab('manual')
      } catch (err) {
        setCsvError(String(err instanceof Error ? err.message : err))
      }
      if (fileRef.current) fileRef.current.value = ''
    }
    reader.readAsText(file, 'UTF-8')
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Filtruj manualne wg miesiąca
  const manualMonthInvoices = manualInvoices.filter(i => i.date.startsWith(month))

  const activeInvoices = tab === 'wfirma' ? wfInvoices : manualMonthInvoices
  const totalRevenue = activeInvoices.reduce((s, i) => s + i.nettoAmount, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Faktury sprzedaży</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={month}
            onChange={e => setMonth(e.target.value)} className="input w-40" />

          {/* Import CSV */}
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={handleFileChange} />
          <button
            onClick={() => fileRef.current?.click()}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Upload size={14} /> Importuj CSV
          </button>

          {tab === 'manual' && (
            <button
              onClick={() => { setEditInvoice(undefined); setShowForm(true) }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={14} /> Nowa faktura
            </button>
          )}

          {tab === 'wfirma' && hasWfirma && (
            <button onClick={loadWfirma} disabled={wfLoading}
              className="btn-secondary flex items-center gap-2">
              <RefreshCw size={14} className={wfLoading ? 'animate-spin' : ''} />
              Pobierz z wFirma
            </button>
          )}
        </div>
      </div>

      {/* CSV feedback */}
      {csvError && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} /> {csvError}
        </div>
      )}
      {csvSuccess && (
        <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm">
          <CheckCircle size={16} /> {csvSuccess}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-1">
        {[
          { id: 'wfirma', label: 'wFirma', count: wfInvoices.length },
          { id: 'manual', label: 'Ręczne / Import', count: manualInvoices.length },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              tab === t.id
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-500'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* wFirma error */}
      {tab === 'wfirma' && wfError && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} /> {wfError}
        </div>
      )}

      {/* wFirma — brak kluczy */}
      {tab === 'wfirma' && !hasWfirma && (
        <div className="card p-8 text-center text-slate-400 space-y-2">
          <FileText size={32} className="mx-auto text-slate-300" />
          <p className="font-medium">Brak kluczy wFirma</p>
          <p className="text-sm">Skonfiguruj integrację w Ustawieniach lub przejdź do zakładki Ręczne.</p>
        </div>
      )}

      {/* Podsumowanie miesiąca */}
      {activeInvoices.length > 0 && (
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="card p-4">
            <p className="text-slate-500">Przychód netto</p>
            <p className="text-xl font-bold text-sky-700">{fmt(totalRevenue)} zł</p>
          </div>
          <div className="card p-4">
            <p className="text-slate-500">Koszty firmowe</p>
            <p className="text-xl font-bold text-slate-700">{fmt(expenses)} zł</p>
          </div>
          <div className="card p-4">
            <p className="text-slate-500">Faktur</p>
            <p className="text-xl font-bold text-slate-700">{activeInvoices.length}</p>
          </div>
        </div>
      )}

      {/* Lista faktur */}
      <div className="card divide-y divide-slate-100">
        {activeInvoices.length === 0 && (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <FileText size={28} className="mx-auto text-slate-300" />
            {tab === 'wfirma'
              ? <p>{wfLoading ? 'Pobieranie faktur…' : 'Brak faktur w wybranym miesiącu.'}</p>
              : (
                <div className="space-y-2">
                  <p>Brak ręcznych faktur w {month}.</p>
                  <div className="flex items-center justify-center gap-3 mt-3">
                    <button onClick={() => setShowForm(true)} className="btn-primary text-sm flex items-center gap-1.5">
                      <Plus size={14} /> Dodaj fakturę
                    </button>
                    <button onClick={() => fileRef.current?.click()} className="btn-secondary text-sm flex items-center gap-1.5">
                      <Upload size={14} /> Importuj CSV
                    </button>
                  </div>
                </div>
              )
            }
          </div>
        )}

        {activeInvoices.map(inv => (
          <InvoiceRow
            key={inv.id}
            invoice={inv}
            allocation={allocations.get(inv.id)}
            expanded={expanded.has(inv.id)}
            onToggle={() => toggleExpand(inv.id)}
            onSaveToSheets={() => handleSaveAllocation(inv.id)}
            onDelete={tab === 'manual' ? () => handleDeleteManual(inv.id) : undefined}
            isSaving={saving === inv.id}
            hasSheets={hasSheets}
            isManual={tab === 'manual'}
          />
        ))}
      </div>

      {/* CSV hint */}
      {tab === 'manual' && manualInvoices.length === 0 && (
        <div className="card p-4 text-xs text-slate-500 space-y-1 bg-slate-50">
          <p className="font-medium text-slate-600">Format importu CSV</p>
          <p>Obsługiwane kolumny (separator: <code>;</code> lub <code>,</code>):</p>
          <p className="font-mono bg-white rounded px-2 py-1 text-xs border">
            Data;Nr faktury;Kontrahent;Netto;VAT;Brutto;Opłacona
          </p>
          <p>Daty w formacie <code>DD.MM.YYYY</code> lub <code>YYYY-MM-DD</code>. Aplikacja automatycznie wykrywa kolumny z eksportu wFirma.</p>
        </div>
      )}

      {/* Modal */}
      {(showForm || editInvoice) && (
        <InvoiceModal
          initial={editInvoice}
          onSave={handleSaveManual}
          onClose={() => { setShowForm(false); setEditInvoice(undefined) }}
        />
      )}
    </div>
  )
}
