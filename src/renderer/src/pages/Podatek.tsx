import { useState, useEffect } from 'react'
import { RefreshCw, AlertCircle, Info } from 'lucide-react'
import { useAppContext } from '../App'
import { ipc } from '../lib/ipc'
import { calculateTax } from '../lib/tax'
import type { Invoice, Expense } from '../lib/types'

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
function nextMonthDeadline(ym: string, day: number): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, day).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
}
function monthLabel(ym: string) {
  return new Date(ym + '-15').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
}

function Row({ label, value, bold, green, red, gray, indent }: {
  label: string; value: string
  bold?: boolean; green?: boolean; red?: boolean; gray?: boolean; indent?: boolean
}) {
  return (
    <div className={`flex justify-between py-2.5 border-b border-slate-100 last:border-0 ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${indent || gray ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
      <span className={`text-sm tabular-nums
        ${bold ? 'font-bold text-slate-900' : ''}
        ${green ? 'text-emerald-600 font-medium' : ''}
        ${red ? 'text-red-600 font-semibold' : ''}
        ${gray ? 'text-slate-400' : ''}
        ${!bold && !green && !red && !gray ? 'text-slate-700' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function DueCard({ title, deadline, rows, total, totalLabel = 'Do zapłaty' }: {
  title: string
  deadline: string
  rows: { label: string; value: number; gray?: boolean }[]
  total: number
  totalLabel?: string
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-1">
        <h2 className="font-semibold text-slate-800">{title}</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4">Termin: <span className="text-slate-500 font-medium">{deadline}</span></p>
      <div>
        {rows.map((r, i) => (
          <Row key={i} label={r.label} value={`${fmt(r.value)} zł`} gray={r.gray} />
        ))}
        <div className="flex justify-between pt-3 mt-2 border-t-2 border-slate-200">
          <span className="font-semibold text-slate-800">{totalLabel}</span>
          <span className={`font-bold text-lg ${total > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {fmt(total)} zł
          </span>
        </div>
      </div>
    </div>
  )
}

export default function Podatek() {
  const { config } = useAppContext()
  const [month, setMonth] = useState(thisMonth())
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [manualRevenue, setManualRevenue] = useState('')
  const [manualExpenses, setManualExpenses] = useState('')
  const [manualVatIn, setManualVatIn] = useState('')
  const [manualVatOut, setManualVatOut] = useState('')

  const hasWfirma = !!config.wfirma.accessKey

  useEffect(() => {
    if (hasWfirma) loadData()
  }, [month, hasWfirma])

  async function loadData() {
    setLoading(true); setError('')
    try {
      const r = monthRange(month)
      const [inv, exp] = await Promise.all([
        ipc.getInvoices(config.wfirma, r.dateFrom, r.dateTo),
        ipc.getExpenses(config.wfirma, r.dateFrom, r.dateTo)
      ])
      setInvoices(inv)
      setExpenses(exp)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setLoading(false)
    }
  }

  // ── Przychody i koszty ──────────────────────────────────────────
  const revenue = hasWfirma
    ? invoices.reduce((s, i) => s + i.nettoAmount, 0)
    : (parseFloat(manualRevenue.replace(',', '.')) || 0)

  const expensesNetto = hasWfirma
    ? expenses.reduce((s, e) => s + e.nettoAmount, 0)
    : (parseFloat(manualExpenses.replace(',', '.')) || 0)

  // ── PIT ────────────────────────────────────────────────────────
  const tax = calculateTax(revenue, expensesNetto, config)

  // ── VAT ────────────────────────────────────────────────────────
  // VAT należny = z faktur sprzedaży
  const vatNalezny = hasWfirma
    ? invoices.reduce((s, i) => s + i.vatAmount, 0)
    : (parseFloat(manualVatOut.replace(',', '.')) || 0)

  // VAT naliczony = z kosztów firmowych (odliczamy od należnego)
  const vatNaliczony = hasWfirma
    ? expenses.reduce((s, e) => s + (e.vatAmount ?? 0), 0)
    : (parseFloat(manualVatIn.replace(',', '.')) || 0)

  const vatDoZaplaty = Math.max(0, vatNalezny - vatNaliczony)
  const vatNadwyzka = Math.max(0, vatNaliczony - vatNalezny)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Podatek i ZUS</h1>
          <p className="text-slate-500 text-sm mt-0.5">Miesięczne zobowiązania: PIT · VAT · ZUS</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={month}
            onChange={e => setMonth(e.target.value)} className="input w-40" />
          {hasWfirma && (
            <button onClick={loadData} disabled={loading}
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

      {/* Manualne pola gdy brak wFirma */}
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
            <div>
              <label className="label">VAT należny ze sprzedaży (zł)</label>
              <input type="text" inputMode="decimal" placeholder="0.00"
                value={manualVatOut} onChange={e => setManualVatOut(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">VAT naliczony z zakupów (zł)</label>
              <input type="text" inputMode="decimal" placeholder="0.00"
                value={manualVatIn} onChange={e => setManualVatIn(e.target.value)} className="input" />
            </div>
          </div>
        </div>
      )}

      {/* Podsumowanie miesiąca */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">
          {monthLabel(month)}
          {loading && <span className="ml-2 text-slate-400 text-sm font-normal">Ładowanie…</span>}
          {hasWfirma && !loading && (
            <span className="ml-2 text-slate-400 text-xs font-normal">
              {invoices.length} fakt. · {expenses.length} koszt.
            </span>
          )}
        </h2>
        <div>
          <Row label="Przychód netto (faktury)" value={`${fmt(revenue)} zł`} />
          <Row label="Koszty firmowe netto" value={`− ${fmt(expensesNetto)} zł`} indent />
          <Row label="ZUS społeczne (KUP)" value={`− ${fmt(config.tax.zusSpołeczne)} zł`} indent />
          <Row label="Podstawa PIT (dochód)" value={`${fmt(tax.dochod)} zł`} bold />
        </div>
      </div>

      {/* Trzy karty terminów */}
      <div className="grid grid-cols-1 gap-4">

        {/* PIT */}
        <DueCard
          title="Zaliczka PIT"
          deadline={`20 ${nextMonthDeadline(month, 20).split(' ').slice(1).join(' ')}`}
          rows={[
            { label: `Podatek PIT ${(config.tax.pitRate * 100).toFixed(0)}% × ${fmt(tax.dochod)} zł`, value: tax.podatek },
          ]}
          total={tax.podatek}
        />

        {/* VAT */}
        <DueCard
          title="Deklaracja VAT (JPK_V7M)"
          deadline={`25 ${nextMonthDeadline(month, 25).split(' ').slice(1).join(' ')}`}
          rows={[
            { label: 'VAT należny (ze sprzedaży)', value: vatNalezny },
            { label: 'VAT naliczony (z zakupów)', value: -vatNaliczony },
            ...(vatNadwyzka > 0 ? [{ label: 'Nadwyżka VAT (przeniesiona lub do zwrotu)', value: 0, gray: true }] : [])
          ]}
          total={vatDoZaplaty}
          totalLabel={vatNadwyzka > 0 ? `Nadwyżka VAT: ${fmt(vatNadwyzka)} zł` : 'VAT do zapłaty'}
        />

        {/* ZUS */}
        <DueCard
          title="ZUS"
          deadline={`10 ${nextMonthDeadline(month, 10).split(' ').slice(1).join(' ')}`}
          rows={[
            { label: 'ZUS społeczne', value: config.tax.zusSpołeczne },
            { label: `Składka zdrowotna (4,9% dochodu, min ${fmt(config.tax.zusZdrowotnaMin)} zł)`, value: tax.skladkaZdrowotna },
          ]}
          total={config.tax.zusSpołeczne + tax.skladkaZdrowotna}
        />

      </div>

      {/* Suma */}
      <div className="card p-5 bg-slate-900 text-white">
        <h2 className="font-semibold mb-4 text-slate-200">Łącznie do zapłaty w miesiącu</h2>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">PIT (do 20.)</span>
            <span className="tabular-nums">{fmt(tax.podatek)} zł</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">VAT (do 25.)</span>
            <span className="tabular-nums">{fmt(vatDoZaplaty)} zł</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">ZUS (do 10.)</span>
            <span className="tabular-nums">{fmt(config.tax.zusSpołeczne + tax.skladkaZdrowotna)} zł</span>
          </div>
          <div className="flex justify-between pt-3 border-t border-slate-700 mt-2">
            <span className="font-semibold text-white">Razem</span>
            <span className="font-bold text-xl text-red-400">
              {fmt(tax.podatek + vatDoZaplaty + config.tax.zusSpołeczne + tax.skladkaZdrowotna)} zł
            </span>
          </div>
        </div>
      </div>

      {/* Przypomnienie */}
      <div className="card p-4 bg-slate-50 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-600">Terminy płatności</p>
        <p>ZUS: do <strong>10.</strong> następnego miesiąca &nbsp;·&nbsp; PIT: do <strong>20.</strong> następnego miesiąca &nbsp;·&nbsp; VAT/JPK_V7M: do <strong>25.</strong> następnego miesiąca</p>
        <p>Dochód = przychód netto − koszty firmowe − ZUS społeczne ({fmt(config.tax.zusSpołeczne)} zł/mies.)</p>
        <p className="text-amber-600">Obliczenia mają charakter szacunkowy — skonsultuj z księgowym.</p>
      </div>
    </div>
  )
}
