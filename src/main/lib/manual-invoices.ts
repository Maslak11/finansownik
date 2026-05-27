import Store from 'electron-store'
import type { Invoice } from '../../shared/types'

const store = new Store<{ invoices: Invoice[] }>({
  name: 'manual-invoices',
  defaults: { invoices: [] }
})

export function getAll(): Invoice[] {
  return store.get('invoices', [])
}

export function save(invoice: Invoice): void {
  const all = getAll().filter(i => i.id !== invoice.id)
  store.set('invoices', [...all, invoice])
}

export function saveMany(invoices: Invoice[]): void {
  const existing = getAll()
  const existingIds = new Set(existing.map(i => i.id))
  const newOnes = invoices.filter(i => !existingIds.has(i.id))
  store.set('invoices', [...existing, ...newOnes])
}

export function remove(id: string): void {
  store.set('invoices', getAll().filter(i => i.id !== id))
}

export function clear(): void {
  store.set('invoices', [])
}

// Parsuj wiersz CSV — obsługuje format wFirma i ogólny
export function parseCSVRow(headers: string[], row: string[]): Invoice | null {
  const h = headers.map(h => h.toLowerCase().trim())
  const get = (keys: string[]): string => {
    for (const k of keys) {
      const idx = h.findIndex(x => x.includes(k))
      if (idx >= 0 && row[idx]) return row[idx].trim()
    }
    return ''
  }

  const nettoRaw = get(['netto', 'net', 'wartość netto', 'wartosc netto'])
  const netto = parseFloat(nettoRaw.replace(/\s/g, '').replace(',', '.')) || 0
  if (netto <= 0) return null

  const vatRaw = get(['vat', 'podatek vat', 'kwota vat'])
  const vat = parseFloat(vatRaw.replace(/\s/g, '').replace(',', '.')) || 0

  const bruttoRaw = get(['brutto', 'gross', 'wartość brutto', 'wartosc brutto'])
  const brutto = parseFloat(bruttoRaw.replace(/\s/g, '').replace(',', '.')) || (netto + vat)

  const dateRaw = get(['data', 'date', 'data wystawienia', 'data sprzedazy', 'data sprzedaży'])
  const date = normalizeDate(dateRaw) || new Date().toISOString().slice(0, 10)

  const number = get(['numer', 'number', 'nr faktury', 'nr', 'faktura'])
  const client = get(['kontrahent', 'nabywca', 'klient', 'client', 'buyer', 'nazwa kontrahenta'])
  const paidRaw = get(['oplacona', 'opłacona', 'paid', 'status', 'platnosc', 'płatność'])
  const paid = /tak|yes|true|oplacona|opłacona|paid/i.test(paidRaw)

  return {
    id: `csv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    number: number || `CSV-${date}`,
    date,
    clientName: client || '',
    nettoAmount: netto,
    vatAmount: vat,
    bruttoAmount: brutto,
    paid
  }
}

function normalizeDate(raw: string): string {
  if (!raw) return ''
  // DD.MM.YYYY → YYYY-MM-DD
  const dmY = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (dmY) return `${dmY[3]}-${dmY[2].padStart(2,'0')}-${dmY[1].padStart(2,'0')}`
  // YYYY-MM-DD — już OK
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // próbuj Date.parse
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return ''
}
