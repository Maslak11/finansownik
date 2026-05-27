import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle, Info } from 'lucide-react'
import { useAppContext } from '../App'
import { ipc } from '../lib/ipc'
import { calculateTax } from '../lib/tax'

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
function quarterOf(ym: string): { q: number; year: number; months: string[] } {
  const [y, m] = ym.split('-').map(Number)
  const q = Math.ceil(m / 3)
  const months = [(q - 1) * 3 + 1, (q - 1) * 3 + 2, q * 3].map(
    mm => `${y}-${String(mm).padStart(2, '0')}`
  )
  return { q, year: y, months }
}
function zusPaymentMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const next = new Date(y, m, 10) // 10. dnia następnego miesiąca
  return next.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}
function pitPaymentDeadline(q: number, year: number) {
  // Zaliczka kwartalna: 20. miesiąca po kwartale
  const month = q * 3 + 1
  if (month > 12) return `20 stycznia ${year + 1}`
  return new Date(year, month - 1, 20).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}

interface MonthData {
  revenue: number
  expenses: number
}

function Row({ label, value, bold, green, red, indent }: {
  label: string; value: string; bold?: boolean; green?: boolean; red?: boolean; indent?: boolean
}) {
  return (
    <div className={`flex justify-between py-2 ${indent ? 'pl-4' : ''} border-b border-slate-100 last:border-0`}>
      <span className={`text-sm ${indent ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-bold text-slate-900' : ''} ${green ? 'text-emerald-600 font-medium' : ''} ${red ? 'text-red-600 font-semibold' : ''} ${!bold && !green && !red ? 'text-slate-700' : ''}`}>
        {value}
      </span>
    </div>
  )
}

export default function Podatek() {
  const { config } = useAppContext()
  const [month, setMonth] = useState(thisMonth())
  const [data, setData] = useState<MonthData>({ revenue: 0, expenses: 0 })
  const [quarterData, setQuarterData] = useState<Record<string, MonthData>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Manualne nadpisanie gdy brak wFirma
  const [manualRevenue, setManualRevenue] = useState('')
  const [manualExpenses, setManualExpenses] = useState('')

  const hasWfirma = !!config.wfirma.accessKey

  useEffect(() => {
    if (hasWfirma) loadMonth(month)
  }, [month, hasWfirma])

  async function loadMonth(ym: string) {
    setLoading(true); setError('')
    try {
      const r = monthRange(ym)
      const [invoices, expenses] = await Promise.all([
        ipc.getInvoices(config.wfirma, r.dateFrom, r.dateTo),
        ipc.getExpenses(config.wfirma, r.dateFrom, r.dateTo)
      ])
      const rev = invoices.reduce((s, i) => s + i.nettoAmount, 0)
      const exp = expenses.reduce((s, e) => s + e.nettoAmount, 0)
      setData({ revenue: rev, expenses: exp })

      // Załaduj pozostałe miesiące kwartału dla sumy kwartalnej
      const { months } = quarterOf(ym)
      const qData: Record<string, MonthData> = {}
      qData[ym] = { revenue: rev, expenses: exp }

      for (const qm of months) {
        if (qm === ym) continue
        const qr = monthRange(qm)
        try {
          const [qi, qe] = await Promise.all([
            ipc.getInvoices(config.wfirma, qr.dateFrom, qr.dateTo),
            ipc.getExpenses(config.wfirma, qr.dateFrom, qr.dateTo)
          ])
          qData[qm] = {
            revenue: qi.reduce((s, i) => s + i.nettoAmount, 0),
            expenses: qe.reduce((s, e) => s + e.nettoAmount, 0)
          }
        } catch {
          qData[qm] = { revenue: 0, expenses: 0 }
        }
      }
      setQuarterData(qData)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setLoading(false)
    }
  }

  const effectiveRevenue = hasWfirma ? data.revenue : (parseFloat(manualRevenue.replace(',', '.')) || 0)
  const effectiveExpenses = hasWfirma ? data.expenses : (parseFloat(manualExpenses.replace(',', '.')) || 0)

  const tax = calculateTax(effectiveRevenue, effectiveExpenses, config)

  // Suma kwartalna
  const { q, year, months: qMonths } = quarterOf(month)
  const qTotalRev = hasWfirma
    ? qMonths.reduce((s, m) => s + (quarterData[m]?.revenue ?? 0), 0)
    : effectiveRevenue
  const qTotalExp = hasWfirma
    ? qMonths.reduce((s, m) => s + (quarterData[m]?.expenses ?? 0), 0)
    : effectiveExpenses
  const qMonthCount = hasWfirma ? 3 : 1
  const qZusSpoleczne = config.tax.zusSpołeczne * qMonthCount
  const qTax = calculateTax(qTotalRev, qTotalExp + qZusSpoleczne - config.tax.zusSpołeczne, {
    ...config,
    tax: { ...config.tax, zusSpołeczne: qZusSpoleczne }
  })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Podatek i ZUS</h1>
          <p className="text-slate-500 text-sm mt-0.5">Szacunek zobowiązań na podstawie przychodów miesiąca</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month}
            onChange={e => setMonth(e.target.value)} className="input w-40" />
          {hasWfirma && (
            <button onClick={() => loadMonth(month)} disabled={loading}
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

      {/* Manualne pole gdy brak wFirma */}
      {!hasWfirma && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            <Info size={14} /> Brak integracji z wFirma — wpisz kwoty ręcznie
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Przychód netto (zł)</label>
              <input type="text" inputMode="decimal" placeholder="0.00"
                value={manualRevenue} onChange={e => setManualRevenue(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Koszty firmowe netto (zł)</label>
              <input type="text" inputMode="decimal" placeholder="0.00"
                value={manualExpenses} onChange={e => setManualExpenses(e.target.value)} className="input" />
            </div>
          </div>
        </div>
      )}

      {/* Miesięczna kalkulacja */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">
          Miesiąc: {new Date(month + '-15').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}
          {loading && <span className="ml-2 text-slate-400 text-sm font-normal">Ładowanie…</span>}
        </h2>

        <div className="space-y-0">
          <Row label="Przychód netto" value={`${fmt(effectiveRevenue)} zł`} />
          <Row label="Koszty firmowe" value={`− ${fmt(effectiveExpenses)} zł`} indent />
          <Row label="ZUS społeczne (koszt uzyskania)" value={`− ${fmt(config.tax.zusSpołeczne)} zł`} indent />
          <Row label="Podstawa opodatkowania (dochód)" value={`${fmt(tax.dochod)} zł`} bold />

          <div className="h-3" />

          <Row label={`Podatek PIT ${(config.tax.pitRate * 100).toFixed(0)}%`}
            value={`${fmt(tax.podatek)} zł`} red />
          <Row label={`Składka zdrowotna (4,9% dochodu)`}
            value={`${fmt(tax.skladkaZdrowotna)} zł`} red />
          <Row label="ZUS społeczne"
            value={`${fmt(config.tax.zusSpołeczne)} zł`} red />

          <div className="mt-3 flex justify-between py-3 bg-red-50 rounded-lg px-4">
            <span className="font-semibold text-slate-800">Łączne obciążenia</span>
            <span className="font-bold text-red-700 text-lg">{fmt(tax.totalObciazenie)} zł</span>
          </div>
        </div>
      </div>

      {/* Terminy płatności */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-3">ZUS do zapłaty</h2>
          <p className="text-xs text-slate-400 mb-3">Termin: {zusPaymentMonth(month)}</p>
          <div className="space-y-0">
            <Row label="ZUS społeczne" value={`${fmt(config.tax.zusSpołeczne)} zł`} />
            <Row label="Składka zdrowotna" value={`${fmt(tax.skladkaZdrowotna)} zł`} />
            <div className="flex justify-between pt-3 mt-1 border-t border-slate-200">
              <span className="font-semibold text-sm text-slate-800">Razem ZUS</span>
              <span className="font-bold text-red-600">{fmt(config.tax.zusSpołeczne + tax.skladkaZdrowotna)} zł</span>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Zaliczka PIT — Q{q} {year}</h2>
          <p className="text-xs text-slate-400 mb-3">Termin: {pitPaymentDeadline(q, year)}</p>
          <div className="space-y-0">
            <Row label="Przychód Q" value={`${fmt(qTotalRev)} zł`} />
            <Row label="Koszty Q" value={`${fmt(qTotalExp)} zł`} />
            <Row label={`Podatek Q${q}`} value={`${fmt(qTax.podatek)} zł`} bold />
            <div className="flex justify-between pt-3 mt-1 border-t border-slate-200">
              <span className="font-semibold text-sm text-slate-800">Zaliczka</span>
              <span className="font-bold text-red-600">{fmt(qTax.podatek)} zł</span>
            </div>
          </div>
          {!hasWfirma && (
            <p className="text-xs text-slate-400 mt-2">* szacunek na podstawie jednego miesiąca</p>
          )}
        </div>
      </div>

      {/* Przypomnienie */}
      <div className="card p-4 bg-slate-50 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-600">Jak działa kalkulacja?</p>
        <p>Dochód = przychód netto − koszty firmowe − ZUS społeczne ({fmt(config.tax.zusSpołeczne)} zł/mies.).</p>
        <p>Składka zdrowotna = max({fmt(config.tax.zusZdrowotnaMin)} zł, {(config.tax.zusZdrowotnaRate * 100).toFixed(1)}% × dochód).</p>
        <p>Podatek PIT = dochód × {(config.tax.pitRate * 100).toFixed(0)}%. Zaliczka płatna kwartalnie.</p>
        <p className="text-amber-600">Obliczenia mają charakter szacunkowy — skonsultuj z księgowym.</p>
      </div>
    </div>
  )
}
