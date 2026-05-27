import type { AppConfig, InvoiceAllocation, Koperty, Invoice } from './types'
import { taxReserveForInvoice } from './tax'

interface AllocateInput {
  invoice: Invoice
  totalMonthRevenue: number
  totalMonthExpenses: number
  config: AppConfig
}

/**
 * Oblicza podział kwoty faktury na koperty.
 *
 * Zasada: suma wszystkich kopert ZAWSZE = netto faktury.
 * Koperty przydzielane są w kolejności priorytetu — każda bierze
 * min(obliczona kwota, co zostało z poprzednich):
 *   1. Podatek PIT    (rezerwa proporcjonalna)
 *   2. ZUS            (społeczne + zdrowotna / avg faktur)
 *   3. Czynsz         (stała kwota / avg faktur)
 *   4. Subskrypcje    (stałe opłaty / avg faktur)
 *   5. Dom            (% z netto)
 *   6. Inwestycje     (% z netto)
 *   7. Do dyspozycji  (reszta ≥ 0)
 */
export function allocateInvoice(input: AllocateInput): InvoiceAllocation {
  const { invoice, totalMonthRevenue, totalMonthExpenses, config } = input
  const { tax, allocation, czynsz, fixedExpenses } = config
  const netto = invoice.nettoAmount
  const avg = Math.max(1, allocation.avgInvoicesPerMonth)

  let remaining = netto

  // 1. Podatek — proporcjonalna rezerwa na PIT
  const podatekWant = taxReserveForInvoice(netto, totalMonthRevenue, totalMonthExpenses, config)
  const podatek = take(podatekWant, remaining)
  remaining -= podatek

  // 2. ZUS — składki społeczne + zdrowotna, rozłożone na avg faktur
  const zusZdrowotna = Math.max(tax.zusZdrowotnaMin, netto * tax.zusZdrowotnaRate)
  const zusWant = round2((tax.zusSpołeczne + zusZdrowotna) / avg)
  const zus = take(zusWant, remaining)
  remaining -= zus

  // 3. Czynsz — stała miesięczna, rozłożona na avg faktur
  const czynszWant = round2(czynsz / avg)
  const czynszPortion = take(czynszWant, remaining)
  remaining -= czynszPortion

  // 4. Subskrypcje i inne stałe opłaty
  const totalSubs = fixedExpenses.reduce((s, e) => s + e.amount, 0)
  const subskrypcjeWant = round2(totalSubs / avg)
  const subskrypcje = take(subskrypcjeWant, remaining)
  remaining -= subskrypcje

  // 5. Dom — % z netto (nie z pozostałości — zachowujemy intencję ustawień)
  const domWant = round2(netto * (allocation.dom / 100))
  const dom = take(domWant, remaining)
  remaining -= dom

  // 6. Inwestycje — % z netto
  const inwestycjeWant = round2(netto * (allocation.inwestycje / 100))
  const inwestycje = take(inwestycjeWant, remaining)
  remaining -= inwestycje

  // 7. Do dyspozycji — co zostało (zawsze ≥ 0)
  const dostepne = round2(Math.max(0, remaining))

  const koperty: Koperty = {
    podatek,
    zus,
    czynsz: czynszPortion,
    subskrypcje,
    dom,
    inwestycje,
    dostepne
  }

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    invoiceDate: invoice.date,
    clientName: invoice.clientName,
    invoiceNetto: netto,
    koperty,
    savedToSheets: false
  }
}

// Wylicz podział dla dowolnej kwoty (szybki kalkulator na dashboardzie)
export function quickAllocate(netto: number, config: AppConfig): Koperty {
  const avg = Math.max(1, config.allocation.avgInvoicesPerMonth)
  const estimatedMonthlyRevenue = netto * avg

  const fakeInvoice: Invoice = {
    id: 'quick',
    number: '',
    date: new Date().toISOString().slice(0, 10),
    clientName: '',
    nettoAmount: netto,
    vatAmount: 0,
    bruttoAmount: netto,
    paid: false
  }
  const result = allocateInvoice({
    invoice: fakeInvoice,
    totalMonthRevenue: estimatedMonthlyRevenue,
    totalMonthExpenses: 0,
    config
  })
  return result.koperty
}

/** Weź min(chcemy, dostępne), zaokrąglone do 2 miejsc. */
function take(want: number, available: number): number {
  return round2(Math.min(Math.max(0, want), Math.max(0, available)))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
