import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle, FileText, ChevronDown, ChevronRight } from 'lucide-react'
import { useAppContext } from '../App'
import { ipc } from '../lib/ipc'
import type { Expense } from '../lib/types'

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function thisMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { dateFrom: `${y}-${mm}-01`, dateTo: `${y}-${mm}-${lastDay}` }
}

export default function Koszty() {
  const { config } = useAppContext()
  const [month, setMonth] = useState(thisMonth())
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [groupBy, setGroupBy] = useState<'category' | 'date'>('category')

  const hasWfirma = !!config.wfirma.accessKey

  useEffect(() => {
    if (hasWfirma) loadExpenses()
  }, [month, hasWfirma])

  async function loadExpenses() {
    setLoading(true); setError('')
    try {
      const r = monthRange(month)
      const exp = await ipc.getExpenses(config.wfirma, r.dateFrom, r.dateTo)
      setExpenses(exp)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setLoading(false)
    }
  }

  function toggleCategory(cat: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  // Sumy
  const totalNetto = expenses.reduce((s, e) => s + e.nettoAmount, 0)
  const totalVat = expenses.reduce((s, e) => s + (e.vatAmount ?? 0), 0)
  const totalBrutto = totalNetto + totalVat

  // Grupowanie
  const byCategory = expenses.reduce<Record<string, Expense[]>>((acc, e) => {
    const cat = e.category || 'Bez kategorii'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(e)
    return acc
  }, {})

  const sortedByDate = [...expenses].sort((a, b) => b.date.localeCompare(a.date))

  const monthLabel = new Date(month + '-15').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Koszty firmowe</h1>
          <p className="text-slate-500 text-sm mt-0.5">Wydatki pobrane z wFirma</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={month}
            onChange={e => setMonth(e.target.value)} className="input w-40" />

          {/* Grupowanie */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            <button
              onClick={() => setGroupBy('category')}
              className={`px-3 py-2 transition-colors ${groupBy === 'category' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Kategorie
            </button>
            <button
              onClick={() => setGroupBy('date')}
              className={`px-3 py-2 transition-colors ${groupBy === 'date' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Chronologicznie
            </button>
          </div>

          {hasWfirma && (
            <button onClick={loadExpenses} disabled={loading}
              className="btn-secondary flex items-center gap-2">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Odśwież
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {!hasWfirma && (
        <div className="card p-8 text-center text-slate-400 space-y-2">
          <FileText size={32} className="mx-auto text-slate-300" />
          <p className="font-medium">Brak integracji z wFirma</p>
          <p className="text-sm">Skonfiguruj klucze API w Ustawieniach.</p>
        </div>
      )}

      {/* Podsumowanie */}
      {expenses.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-slate-500 text-sm">Koszty netto</p>
            <p className="text-xl font-bold text-slate-800">{fmt(totalNetto)} zł</p>
            <p className="text-xs text-slate-400 mt-0.5">{expenses.length} pozycji</p>
          </div>
          <div className="card p-4">
            <p className="text-slate-500 text-sm">VAT naliczony</p>
            <p className="text-xl font-bold text-emerald-700">{fmt(totalVat)} zł</p>
            <p className="text-xs text-slate-400 mt-0.5">do odliczenia</p>
          </div>
          <div className="card p-4">
            <p className="text-slate-500 text-sm">Brutto łącznie</p>
            <p className="text-xl font-bold text-slate-800">{fmt(totalBrutto)} zł</p>
            <p className="text-xs text-slate-400 mt-0.5">{Object.keys(byCategory).length} kategorii</p>
          </div>
        </div>
      )}

      {/* Lista */}
      {hasWfirma && !loading && expenses.length === 0 && (
        <div className="card p-8 text-center text-slate-400 space-y-1">
          <FileText size={28} className="mx-auto text-slate-300" />
          <p>Brak kosztów w {monthLabel}.</p>
        </div>
      )}

      {loading && (
        <div className="card p-8 text-center text-slate-400">
          <p>Pobieranie kosztów…</p>
        </div>
      )}

      {/* Grupowanie po kategoriach */}
      {!loading && expenses.length > 0 && groupBy === 'category' && (
        <div className="space-y-3">
          {Object.entries(byCategory)
            .sort((a, b) => b[1].reduce((s, e) => s + e.nettoAmount, 0) - a[1].reduce((s, e) => s + e.nettoAmount, 0))
            .map(([cat, items]) => {
              const catNetto = items.reduce((s, e) => s + e.nettoAmount, 0)
              const catVat = items.reduce((s, e) => s + (e.vatAmount ?? 0), 0)
              const expanded = expandedCategories.has(cat)
              return (
                <div key={cat} className="card overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors"
                    onClick={() => toggleCategory(cat)}
                  >
                    <span className="text-slate-400">
                      {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                    <span className="flex-1 text-left font-medium text-slate-800">{cat}</span>
                    <span className="text-xs text-slate-400 mr-4">{items.length} pozycji</span>
                    <span className="text-sm font-semibold text-slate-700">{fmt(catNetto)} zł</span>
                    {catVat > 0 && (
                      <span className="text-xs text-emerald-600 ml-2">+{fmt(catVat)} VAT</span>
                    )}
                  </button>

                  {expanded && (
                    <div className="border-t border-slate-100">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">Data</th>
                            <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Opis</th>
                            <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500">Netto</th>
                            <th className="text-right px-5 py-2.5 text-xs font-medium text-slate-500">VAT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {items
                            .sort((a, b) => b.date.localeCompare(a.date))
                            .map(exp => (
                              <tr key={exp.id} className="hover:bg-slate-50">
                                <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{exp.date}</td>
                                <td className="px-3 py-3 text-slate-700 max-w-xs truncate">{exp.description || '—'}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-slate-800 font-medium whitespace-nowrap">{fmt(exp.nettoAmount)} zł</td>
                                <td className="px-5 py-3 text-right tabular-nums text-emerald-600 whitespace-nowrap">
                                  {(exp.vatAmount ?? 0) > 0 ? `${fmt(exp.vatAmount ?? 0)} zł` : '—'}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200">
                          <tr>
                            <td colSpan={2} className="px-5 py-2.5 text-xs font-medium text-slate-500">Suma kategorii</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800">{fmt(catNetto)} zł</td>
                            <td className="px-5 py-2.5 text-right tabular-nums font-medium text-emerald-600">
                              {catVat > 0 ? `${fmt(catVat)} zł` : '—'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}

          {/* Suma globalna */}
          <div className="card p-4 bg-slate-900 text-white flex items-center justify-between">
            <span className="font-semibold text-slate-200">Łącznie {monthLabel}</span>
            <div className="text-right">
              <span className="font-bold text-lg">{fmt(totalNetto)} zł</span>
              <span className="text-slate-400 text-sm ml-2">netto</span>
              {totalVat > 0 && (
                <span className="ml-3 text-emerald-400 text-sm">+{fmt(totalVat)} zł VAT</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Widok chronologiczny */}
      {!loading && expenses.length > 0 && groupBy === 'date' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Data</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Opis</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-slate-500">Kategoria</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-slate-500">Netto</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-slate-500">VAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedByDate.map(exp => (
                <tr key={exp.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{exp.date}</td>
                  <td className="px-3 py-3 text-slate-700 max-w-xs truncate">{exp.description || '—'}</td>
                  <td className="px-3 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {exp.category || 'Bez kategorii'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium text-slate-800 whitespace-nowrap">{fmt(exp.nettoAmount)} zł</td>
                  <td className="px-5 py-3 text-right tabular-nums text-emerald-600 whitespace-nowrap">
                    {(exp.vatAmount ?? 0) > 0 ? `${fmt(exp.vatAmount ?? 0)} zł` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
              <tr>
                <td colSpan={3} className="px-5 py-3 text-sm font-semibold text-slate-700">Razem</td>
                <td className="px-3 py-3 text-right tabular-nums font-bold text-slate-900">{fmt(totalNetto)} zł</td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold text-emerald-600">
                  {totalVat > 0 ? `${fmt(totalVat)} zł` : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
