import { useState } from 'react'
import { Plus, Trash2, Pencil, CreditCard, CheckCircle, X, AlertCircle } from 'lucide-react'
import { useAppContext } from '../App'
import type { Installment } from '../lib/types'

function genId() {
  return Math.random().toString(36).slice(2, 11)
}

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Zwraca "Marzec 2026" dla "2026-03" */
function formatYearMonth(ym: string): string {
  if (!ym) return '—'
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 15).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
}

/** Oblicza miesiąc zakończenia rat z danego początku i liczby wszystkich rat */
function endYearMonth(startYM: string, total: number): string {
  if (!startYM || total <= 0) return '—'
  const [y, m] = startYM.split('-').map(Number)
  const end = new Date(y, m - 1 + total - 1, 1)
  return end.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
}

/** Bieżący YYYY-MM */
function nowYM(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const EMPTY_FORM: Omit<Installment, 'id'> = {
  name: '',
  monthlyAmount: 0,
  totalInstallments: 12,
  remainingInstallments: 12,
  startYearMonth: nowYM()
}

interface FormState extends Omit<Installment, 'id'> {
  id?: string
}

export default function Raty() {
  const { config, saveConfig } = useAppContext()
  const installments: Installment[] = config.installments ?? []

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const totalMonthly = installments.reduce((s, r) => s + r.monthlyAmount, 0)
  const totalRemaining = installments.reduce((s, r) => s + r.monthlyAmount * r.remainingInstallments, 0)

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(inst: Installment) {
    setForm({ ...inst })
    setEditingId(inst.id)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim() || form.monthlyAmount <= 0 || form.remainingInstallments < 0) return
    setSaving(true)
    try {
      let next: Installment[]
      if (editingId) {
        next = installments.map(i =>
          i.id === editingId ? { ...form, id: editingId } as Installment : i
        )
      } else {
        next = [...installments, { ...form, id: genId() } as Installment]
      }
      await saveConfig({ ...config, installments: next })
      closeForm()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await saveConfig({ ...config, installments: installments.filter(i => i.id !== id) })
    setDeleteConfirm(null)
  }

  /** Zmniejsz pozostałe raty o 1 (oznacz bieżący miesiąc jako spłacony) */
  async function markPaid(inst: Installment) {
    if (inst.remainingInstallments <= 0) return
    const next = installments.map(i =>
      i.id === inst.id
        ? { ...i, remainingInstallments: Math.max(0, i.remainingInstallments - 1) }
        : i
    )
    await saveConfig({ ...config, installments: next })
  }

  const paidOff = installments.filter(i => i.remainingInstallments === 0)
  const active = installments.filter(i => i.remainingInstallments > 0)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Raty i kredyty</h1>
          <p className="text-slate-500 text-sm mt-0.5">Miesięczne zobowiązania ratalne</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus size={15} />
          Dodaj ratę
        </button>
      </div>

      {/* Podsumowanie */}
      {installments.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4 border-l-4 border-orange-300">
            <p className="text-xs text-slate-500 mb-1">Miesięcznie łącznie</p>
            <p className="text-xl font-bold text-orange-600">{fmt(totalMonthly)} zł</p>
            <p className="text-xs text-slate-400 mt-1">{active.length} aktywnych rat</p>
          </div>
          <div className="card p-4 border-l-4 border-slate-300">
            <p className="text-xs text-slate-500 mb-1">Pozostało do spłaty</p>
            <p className="text-xl font-bold text-slate-700">{fmt(totalRemaining)} zł</p>
            <p className="text-xs text-slate-400 mt-1">łącznie wszystkie</p>
          </div>
          <div className="card p-4 border-l-4 border-emerald-300">
            <p className="text-xs text-slate-500 mb-1">Spłacone</p>
            <p className="text-xl font-bold text-emerald-600">{paidOff.length}</p>
            <p className="text-xs text-slate-400 mt-1">
              {paidOff.length === 0 ? 'brak ukończonych' : 'można usunąć'}
            </p>
          </div>
        </div>
      )}

      {/* Brak rat */}
      {installments.length === 0 && (
        <div className="card p-10 text-center space-y-3">
          <CreditCard size={36} className="mx-auto text-slate-300" />
          <p className="font-medium text-slate-600">Brak dodanych rat</p>
          <p className="text-sm text-slate-400 max-w-xs mx-auto">
            Dodaj leasing, kredyt lub dowolną płatność ratalną aby śledzić miesięczne obciążenie.
          </p>
          <button onClick={openAdd} className="btn-primary mx-auto">
            <Plus size={14} className="inline mr-1.5" />
            Dodaj pierwszą ratę
          </button>
        </div>
      )}

      {/* Lista aktywnych */}
      {active.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Aktywne</h2>
          {active.map(inst => (
            <InstallmentCard
              key={inst.id}
              inst={inst}
              onEdit={() => openEdit(inst)}
              onMarkPaid={() => markPaid(inst)}
              onDelete={() => setDeleteConfirm(inst.id)}
              deleteConfirm={deleteConfirm === inst.id}
              onDeleteConfirm={() => handleDelete(inst.id)}
              onDeleteCancel={() => setDeleteConfirm(null)}
            />
          ))}
        </div>
      )}

      {/* Lista spłaconych */}
      {paidOff.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Spłacone</h2>
          {paidOff.map(inst => (
            <InstallmentCard
              key={inst.id}
              inst={inst}
              onEdit={() => openEdit(inst)}
              onMarkPaid={() => markPaid(inst)}
              onDelete={() => setDeleteConfirm(inst.id)}
              deleteConfirm={deleteConfirm === inst.id}
              onDeleteConfirm={() => handleDelete(inst.id)}
              onDeleteCancel={() => setDeleteConfirm(null)}
            />
          ))}
        </div>
      )}

      {/* Formularz dodawania / edycji */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">
                {editingId ? 'Edytuj ratę' : 'Nowa rata / kredyt'}
              </h3>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Nazwa */}
              <div>
                <label className="label">Nazwa zobowiązania</label>
                <input
                  type="text"
                  placeholder="np. Leasing auto, Laptop Dell, Kredyt gotówkowy"
                  value={form.name}
                  onChange={e => updateForm('name', e.target.value)}
                  className="input"
                  autoFocus
                />
              </div>

              {/* Kwota raty */}
              <div>
                <label className="label">Rata miesięczna (zł)</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.monthlyAmount || ''}
                    onChange={e => updateForm('monthlyAmount', parseFloat(e.target.value) || 0)}
                    className="input pr-8 text-right"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-400 text-sm">zł</span>
                </div>
              </div>

              {/* Liczba rat */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Łączna liczba rat</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.totalInstallments || ''}
                      onChange={e => {
                        const total = parseInt(e.target.value) || 1
                        updateForm('totalInstallments', total)
                        // Jeśli remaining > total, skoryguj
                        if (form.remainingInstallments > total) {
                          updateForm('remainingInstallments', total)
                        }
                      }}
                      className="input pr-10 text-right"
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 text-sm">szt.</span>
                  </div>
                </div>
                <div>
                  <label className="label">Pozostało rat</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={form.totalInstallments}
                      step={1}
                      value={form.remainingInstallments}
                      onChange={e => updateForm('remainingInstallments', Math.min(
                        form.totalInstallments,
                        Math.max(0, parseInt(e.target.value) || 0)
                      ))}
                      className="input pr-10 text-right"
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 text-sm">szt.</span>
                  </div>
                </div>
              </div>

              {/* Data rozpoczęcia */}
              <div>
                <label className="label">Miesiąc pierwszej raty</label>
                <input
                  type="month"
                  value={form.startYearMonth}
                  onChange={e => updateForm('startYearMonth', e.target.value)}
                  className="input"
                />
              </div>

              {/* Podgląd */}
              {form.monthlyAmount > 0 && form.remainingInstallments > 0 && (
                <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm space-y-1 text-slate-600">
                  <p>Pozostało do spłaty: <strong className="text-slate-800">{fmt(form.monthlyAmount * form.remainingInstallments)} zł</strong></p>
                  <p>Koniec zobowiązania: <strong className="text-slate-800">{endYearMonth(form.startYearMonth, form.totalInstallments)}</strong></p>
                </div>
              )}

              {/* Walidacja */}
              {(!form.name.trim() || form.monthlyAmount <= 0) && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg px-3 py-2 text-xs">
                  <AlertCircle size={13} />
                  Wypełnij nazwę i kwotę raty.
                </div>
              )}
            </div>

            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button onClick={closeForm} className="btn-secondary">Anuluj</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || form.monthlyAmount <= 0}
                className="btn-primary"
              >
                {saving ? 'Zapisuję…' : editingId ? 'Zapisz zmiany' : 'Dodaj ratę'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Karta raty ──────────────────────────────────────── */

interface CardProps {
  inst: Installment
  onEdit: () => void
  onMarkPaid: () => void
  onDelete: () => void
  deleteConfirm: boolean
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}

function InstallmentCard({ inst, onEdit, onMarkPaid, onDelete, deleteConfirm, onDeleteConfirm, onDeleteCancel }: CardProps) {
  const progress = inst.totalInstallments > 0
    ? Math.round(((inst.totalInstallments - inst.remainingInstallments) / inst.totalInstallments) * 100)
    : 100
  const isPaidOff = inst.remainingInstallments === 0
  const remaining = inst.monthlyAmount * inst.remainingInstallments

  function fmt2(n: number) {
    return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function endDate(): string {
    if (!inst.startYearMonth || inst.totalInstallments <= 0) return '—'
    const [y, m] = inst.startYearMonth.split('-').map(Number)
    const end = new Date(y, m - 1 + inst.totalInstallments - 1, 1)
    return end.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
  }

  return (
    <div className={`card p-5 transition-opacity ${isPaidOff ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-4">
        {/* Ikona statusu */}
        <div className={`p-2 rounded-lg flex-shrink-0 ${isPaidOff ? 'bg-emerald-100' : 'bg-orange-100'}`}>
          {isPaidOff
            ? <CheckCircle size={18} className="text-emerald-600" />
            : <CreditCard size={18} className="text-orange-600" />
          }
        </div>

        {/* Treść */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-slate-800 truncate">{inst.name}</p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {!isPaidOff && (
                <button
                  onClick={onMarkPaid}
                  className="btn-ghost p-1.5 text-slate-400 hover:text-emerald-600 text-xs"
                  title="Oznacz ratę jako zapłaconą (zmniejsz licznik o 1)"
                >
                  <CheckCircle size={15} />
                </button>
              )}
              <button onClick={onEdit} className="btn-ghost p-1.5 text-slate-400 hover:text-slate-700">
                <Pencil size={14} />
              </button>
              {!deleteConfirm
                ? (
                  <button onClick={onDelete} className="btn-ghost p-1.5 text-slate-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                )
                : (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-red-600">Usuń?</span>
                    <button onClick={onDeleteConfirm} className="btn-ghost p-1 text-red-600 hover:text-red-700 text-xs font-medium">Tak</button>
                    <button onClick={onDeleteCancel} className="btn-ghost p-1 text-slate-500 text-xs">Nie</button>
                  </div>
                )
              }
            </div>
          </div>

          {/* Pasek postępu */}
          <div className="mt-2 mb-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>
                {isPaidOff
                  ? 'Spłacona'
                  : `${inst.totalInstallments - inst.remainingInstallments} / ${inst.totalInstallments} rat`
                }
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isPaidOff ? 'bg-emerald-500' : 'bg-orange-400'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Szczegóły */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">Rata/mies.</p>
              <p className="font-semibold text-slate-700">{fmt2(inst.monthlyAmount)} zł</p>
            </div>
            {!isPaidOff && (
              <div>
                <p className="text-xs text-slate-400">Pozostało</p>
                <p className="font-semibold text-orange-600">{fmt2(remaining)} zł</p>
                <p className="text-xs text-slate-400">{inst.remainingInstallments} rat</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-400">Koniec</p>
              <p className="font-medium text-slate-600 text-xs">{endDate()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
