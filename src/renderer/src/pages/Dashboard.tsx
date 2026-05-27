import { useState, useEffect } from 'react'
import { TrendingUp, AlertCircle, RefreshCw } from 'lucide-react'
import { useAppContext } from '../App'
import { ipc } from '../lib/ipc'
import { calculateTax } from '../lib/tax'
import { quickAllocate } from '../lib/allocator'
import KopertaBar from '../components/KopertaBar'
import type { Invoice, Expense } from '../lib/types'

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function currentMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const lastDay = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return {
    dateFrom: `${y}-${mm}-01`,
    dateTo: `${y}-${mm}-${lastDay}`,
    label: `${mm}/${y}`
  }
}

export default function Dashboard() {
  const { config, configLoaded } = useAppContext()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [quickAmount, setQuickAmount] = useState('')
  const [quickKoperty, setQuickKoperty] = useState<ReturnType<typeof quickAllocate> | null>(null)

  const hasWfirma = config.wfirma.accessKey.length > 0
  const range = currentMonthRange()

  useEffect(() => {
    if (configLoaded && hasWfirma) loadData()
  }, [configLoaded])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [inv, exp] = await Promise.all([
        ipc.getInvoices(config.wfirma, range.dateFrom, range.dateTo),
        ipc.getExpenses(config.wfirma, range.dateFrom, range.dateTo)
      ])
      setInvoices(inv)
      setExpenses(exp)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setLoading(false)
    }
  }

  const monthRevenue = invoices.reduce((s, i) => s + i.nettoAmount, 0)
  const monthExpenses = expenses.reduce((s, e) => s + e.nettoAmount, 0)
  const taxResult = calculateTax(monthRevenue, monthExpenses, config)

  function handleQuickCalc() {
    const n = parseFloat(quickAmount.replace(',', '.'))
    if (!n || n <= 0) return
    setQuickKoperty(quickAllocate(n, config))
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Bieżący miesiąc: {range.label}</p>
        </div>
        {hasWfirma && (
          <button onClick={loadData} disabled={loading} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Odśwież z wFirma
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {!hasWfirma && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-amber-800 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          Brak kluczy wFirma — skonfiguruj integrację w Ustawieniach, aby pobierać faktury automatycznie.
        </div>
      )}

      {/* Statystyki */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label={`Przychód ${range.label}`}
          value={`${fmt(monthRevenue)} zł`}
          sub={`${invoices.length} faktur`}
          color="sky"
        />
        <StatCard
          label="Szacowany podatek"
          value={`${fmt(taxResult.podatek)} zł`}
          sub={`dochód: ${fmt(taxResult.dochod)} zł`}
          color="red"
        />
        <StatCard
          label="ZUS łącznie (mies.)"
          value={`${fmt(config.tax.zusSpołeczne + taxResult.skladkaZdrowotna)} zł`}
          sub={`społeczne + zdrowotna`}
          color="orange"
        />
      </div>

      {/* Miesięczne podsumowanie */}
      {(monthRevenue > 0 || !hasWfirma) && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <TrendingUp size={16} />
            Szacunek podatkowy — {range.label}
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Row label="Przychód netto" value={`${fmt(monthRevenue)} zł`} />
            <Row label="Koszty firmowe" value={`${fmt(monthExpenses)} zł`} />
            <Row label="ZUS społeczne (odliczane)" value={`− ${fmt(config.tax.zusSpołeczne)} zł`} />
            <Row label="Dochód podatkowy" value={`${fmt(taxResult.dochod)} zł`} bold />
            <Row label="Składka zdrowotna (4,9%)" value={`${fmt(taxResult.skladkaZdrowotna)} zł`} />
            <Row label="Zaliczka PIT 19%" value={`${fmt(taxResult.podatek)} zł`} bold red />
          </div>
        </div>
      )}

      {/* Szybki kalkulator */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Szybki kalkulator faktury</h2>
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Kwota netto faktury"
              value={quickAmount}
              onChange={(e) => setQuickAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleQuickCalc()}
              className="input pr-8"
            />
            <span className="absolute right-3 top-2.5 text-slate-400 text-sm">zł</span>
          </div>
          <button onClick={handleQuickCalc} className="btn-primary">
            Oblicz podział
          </button>
        </div>

        {quickKoperty && (
          <div className="space-y-4">
            <KopertaBar koperty={quickKoperty} total={parseFloat(quickAmount.replace(',', '.')) || 0} />
          </div>
        )}

        {!quickKoperty && (
          <p className="text-sm text-slate-400">
            Wpisz kwotę netto faktury i kliknij "Oblicz podział", aby zobaczyć alokację na koperty.
          </p>
        )}
      </div>

      {/* Ostatnie faktury */}
      {invoices.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Faktury tego miesiąca</h2>
          <div className="space-y-2">
            {invoices.slice(0, 5).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div>
                  <span className="font-medium text-slate-800 text-sm">{inv.number}</span>
                  <span className="text-slate-500 text-xs ml-2">{inv.clientName}</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-slate-800 text-sm">{fmt(inv.nettoAmount)} zł</span>
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${inv.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {inv.paid ? 'opłacona' : 'oczekuje'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const border = { sky: 'border-sky-200', red: 'border-red-200', orange: 'border-orange-200' }[color] ?? ''
  const text = { sky: 'text-sky-700', red: 'text-red-700', orange: 'text-orange-700' }[color] ?? ''
  return (
    <div className={`card p-4 border-l-4 ${border}`}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${text}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  )
}

function Row({ label, value, bold, red }: { label: string; value: string; bold?: boolean; red?: boolean }) {
  return (
    <>
      <span className="text-slate-600">{label}</span>
      <span className={`text-right tabular-nums ${bold ? 'font-semibold' : ''} ${red ? 'text-red-600' : 'text-slate-800'}`}>
        {value}
      </span>
    </>
  )
}
