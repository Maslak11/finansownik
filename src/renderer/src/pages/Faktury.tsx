import { useState, useEffect } from 'react'
import { RefreshCw, Save, ChevronDown, ChevronRight, AlertCircle, CheckCircle } from 'lucide-react'
import { useAppContext } from '../App'
import { ipc } from '../lib/ipc'
import { allocateInvoice } from '../lib/allocator'
import KopertaBar from '../components/KopertaBar'
import type { Invoice, Expense, InvoiceAllocation } from '../lib/types'

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthRange(ym: string) {
  const [y, m] = ym.split('-')
  return { dateFrom: `${y}-${m}-01`, dateTo: `${y}-${m}-31` }
}

function thisMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function Faktury() {
  const { config } = useAppContext()
  const [month, setMonth] = useState(thisMonth())
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [allocations, setAllocations] = useState<Map<string, InvoiceAllocation>>(new Map())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const hasWfirma = config.wfirma.accessKey.length > 0
  const hasSheets = config.sheets.spreadsheetId.length > 0

  useEffect(() => {
    if (hasWfirma) loadData()
  }, [month])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const r = monthRange(month)
      const [inv, exp] = await Promise.all([
        ipc.getInvoices(config.wfirma, r.dateFrom, r.dateTo),
        ipc.getExpenses(config.wfirma, r.dateFrom, r.dateTo)
      ])
      setInvoices(inv)
      setExpenses(exp)

      const totalRevenue = inv.reduce((s, i) => s + i.nettoAmount, 0)
      const totalExpenses = exp.reduce((s, e) => s + e.nettoAmount, 0)

      const newMap = new Map<string, InvoiceAllocation>()
      for (const invoice of inv) {
        newMap.set(
          invoice.id,
          allocateInvoice({ invoice, totalMonthRevenue: totalRevenue, totalMonthExpenses: totalExpenses, config })
        )
      }
      setAllocations(newMap)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setLoading(false)
    }
  }

  async function saveAllocation(invoiceId: string) {
    if (!hasSheets) return
    const alloc = allocations.get(invoiceId)
    if (!alloc) return
    setSaving(invoiceId)
    try {
      await ipc.saveAllocation(config.sheets, alloc)
      setAllocations((prev) => {
        const next = new Map(prev)
        next.set(invoiceId, { ...alloc, savedToSheets: true })
        return next
      })
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setSaving(null)
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const totalRevenue = invoices.reduce((s, i) => s + i.nettoAmount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.nettoAmount, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Faktury sprzedaży</h1>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input w-40"
          />
          {hasWfirma && (
            <button onClick={loadData} disabled={loading} className="btn-secondary flex items-center gap-2">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Pobierz z wFirma
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {!hasWfirma && (
        <div className="card p-6 text-center text-slate-500">
          <p className="font-medium">Brak konfiguracji wFirma</p>
          <p className="text-sm mt-1">Przejdź do Ustawień i podaj klucze API wFirma.</p>
        </div>
      )}

      {/* Podsumowanie miesiąca */}
      {invoices.length > 0 && (
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="card p-4">
            <p className="text-slate-500">Przychód netto</p>
            <p className="text-xl font-bold text-sky-700">{fmt(totalRevenue)} zł</p>
          </div>
          <div className="card p-4">
            <p className="text-slate-500">Koszty firmowe</p>
            <p className="text-xl font-bold text-slate-700">{fmt(totalExpenses)} zł</p>
          </div>
          <div className="card p-4">
            <p className="text-slate-500">Faktur</p>
            <p className="text-xl font-bold text-slate-700">{invoices.length}</p>
          </div>
        </div>
      )}

      {/* Lista faktur */}
      <div className="card divide-y divide-slate-100">
        {invoices.length === 0 && hasWfirma && !loading && (
          <div className="p-8 text-center text-slate-400">Brak faktur w wybranym miesiącu.</div>
        )}

        {invoices.map((inv) => {
          const alloc = allocations.get(inv.id)
          const isExpanded = expanded.has(inv.id)

          return (
            <div key={inv.id}>
              <div
                className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50"
                onClick={() => toggleExpand(inv.id)}
              >
                <span className="text-slate-400">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{inv.number}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${inv.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {inv.paid ? 'opłacona' : 'oczekuje'}
                    </span>
                    {alloc?.savedToSheets && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <CheckCircle size={12} className="text-emerald-500" /> zapisana
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{inv.clientName} · {inv.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-800">{fmt(inv.nettoAmount)} zł</p>
                  <p className="text-xs text-slate-400">netto</p>
                </div>
              </div>

              {isExpanded && alloc && (
                <div className="px-5 pb-5 bg-slate-50 border-t border-slate-100">
                  <div className="pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-700">Podział na koperty</h3>
                      {hasSheets && !alloc.savedToSheets && (
                        <button
                          onClick={() => saveAllocation(inv.id)}
                          disabled={saving === inv.id}
                          className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
                        >
                          <Save size={12} />
                          {saving === inv.id ? 'Zapisuję...' : 'Zapisz do Sheets'}
                        </button>
                      )}
                    </div>
                    <KopertaBar koperty={alloc.koperty} total={inv.nettoAmount} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Koszty */}
      {expenses.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Koszty firmowe ({expenses.length})</h2>
          <div className="space-y-1.5 text-sm">
            {expenses.map((exp) => (
              <div key={exp.id} className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
                <div>
                  <span className="text-slate-700">{exp.description || '(brak opisu)'}</span>
                  <span className="text-slate-400 text-xs ml-2">{exp.date}</span>
                </div>
                <span className="font-medium text-slate-800 tabular-nums">{fmt(exp.nettoAmount)} zł</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
