import type { AppConfig, TaxResult } from './types'

export function calculateTax(
  revenue: number,
  expenses: number,
  config: AppConfig
): TaxResult {
  const { pitRate, zusSpołeczne, zusZdrowotnaMin, zusZdrowotnaRate } = config.tax

  // ZUS społeczne jest kosztem uzyskania przychodu
  const dochod = Math.max(0, revenue - expenses - zusSpołeczne)

  // Składka zdrowotna: 4,9% dochodu, ale nie mniej niż minimum
  const skladkaZdrowotna = dochod > 0
    ? Math.max(zusZdrowotnaMin, dochod * zusZdrowotnaRate)
    : zusZdrowotnaMin

  // Podatek liniowy 19% od dochodu
  const podatek = dochod * pitRate

  return {
    dochod: round2(dochod),
    skladkaZdrowotna: round2(skladkaZdrowotna),
    podatek: round2(podatek),
    zusSpołeczne,
    totalObciazenie: round2(podatek + skladkaZdrowotna + zusSpołeczne)
  }
}

// Szacunkowa rezerwa podatkowa dla jednej faktury,
// biorąc pod uwagę proporcjonalny udział w przychodach miesiąca.
export function taxReserveForInvoice(
  invoiceNetto: number,
  totalMonthRevenue: number,
  totalMonthExpenses: number,
  config: AppConfig
): number {
  if (totalMonthRevenue <= 0) {
    // Brak danych miesięcznych — prosta estymacja
    return round2(invoiceNetto * config.tax.pitRate * 0.7)
  }

  const share = invoiceNetto / totalMonthRevenue
  const expenseShare = totalMonthExpenses * share
  const zusShare = config.tax.zusSpołeczne * share
  const invoiceDochod = Math.max(0, invoiceNetto - expenseShare - zusShare)

  return round2(invoiceDochod * config.tax.pitRate)
}

// Estymowana zaliczka kwartalna
export function estimateQuarterlyAdvance(
  quarterRevenue: number,
  quarterExpenses: number,
  config: AppConfig
): number {
  const result = calculateTax(quarterRevenue, quarterExpenses, config)
  return result.podatek
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
