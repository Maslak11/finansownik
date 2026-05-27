import type { AppConfig, InvoiceAllocation, Koperty, Invoice } from './types'
import { taxReserveForInvoice } from './tax'

interface AllocateInput {
  invoice: Invoice
  totalMonthRevenue: number
  totalMonthExpenses: number
  config: AppConfig
}

export function allocateInvoice(input: AllocateInput): InvoiceAllocation {
  const { invoice, totalMonthRevenue, totalMonthExpenses, config } = input
  const { tax, allocation, czynsz, fixedExpenses } = config
  const netto = invoice.nettoAmount
  const avg = Math.max(1, allocation.avgInvoicesPerMonth)

  // 1. Podatek — proporcjonalna rezerwa na PIT
  const podatek = taxReserveForInvoice(netto, totalMonthRevenue, totalMonthExpenses, config)

  // 2. ZUS — składki społeczne + zdrowotna, rozłożone na avg faktur
  const zusZdrowotna = Math.max(tax.zusZdrowotnaMin, netto * tax.zusZdrowotnaRate)
  const zus = round2((tax.zusSpołeczne + zusZdrowotna) / avg)

  // 3. Czynsz — stała miesięczna, rozłożona na avg faktur
  const czynszPortion = round2(czynsz / avg)

  // 4. Subskrypcje i inne stałe opłaty
  const totalSubs = fixedExpenses.reduce((s, e) => s + e.amount, 0)
  const subskrypcje = round2(totalSubs / avg)

  // 5. Dom i inwestycje — % z netto
  const dom = round2(netto * (allocation.dom / 100))
  const inwestycje = round2(netto * (allocation.inwestycje / 100))

  // 6. Dostępne = reszta
  const reserved = podatek + zus + czynszPortion + subskrypcje + dom + inwestycje
  const dostepne = round2(Math.max(0, netto - reserved))

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
    totalMonthRevenue: netto,
    totalMonthExpenses: 0,
    config
  })
  return result.koperty
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
