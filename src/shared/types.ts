export interface WfirmaCredentials {
  accessKey: string
  secretKey: string
  appKey: string
}

export interface SheetsCredentials {
  serviceAccountJson: string
  spreadsheetId: string
}

export interface TaxConfig {
  pitRate: number           // np. 0.19
  zusSpołeczne: number      // PLN/miesiąc, np. 1773
  zusZdrowotnaMin: number   // minimalna składka zdrowotna PLN, np. 314
  zusZdrowotnaRate: number  // np. 0.049
}

export interface FixedExpense {
  id: string
  name: string
  amount: number  // PLN/miesiąc
}

export interface AllocationConfig {
  dom: number         // % z netto
  inwestycje: number  // % z netto
  avgInvoicesPerMonth: number
}

export interface AppConfig {
  wfirma: WfirmaCredentials
  sheets: SheetsCredentials
  tax: TaxConfig
  allocation: AllocationConfig
  czynsz: number
  fixedExpenses: FixedExpense[]
  wizardCompleted: boolean
}

export const DEFAULT_CONFIG: AppConfig = {
  wfirma: { accessKey: '', secretKey: '', appKey: '' },
  sheets: { serviceAccountJson: '', spreadsheetId: '' },
  tax: {
    pitRate: 0.19,
    zusSpołeczne: 1773,
    zusZdrowotnaMin: 314,
    zusZdrowotnaRate: 0.049
  },
  allocation: {
    dom: 15,
    inwestycje: 5,
    avgInvoicesPerMonth: 2
  },
  czynsz: 0,
  fixedExpenses: [],
  wizardCompleted: false
}

export interface Invoice {
  id: string
  number: string
  date: string
  clientName: string
  nettoAmount: number
  vatAmount: number
  bruttoAmount: number
  paid: boolean
}

export interface Expense {
  id: string
  date: string
  description: string
  nettoAmount: number
  category: string
}

export interface Koperty {
  podatek: number
  zus: number
  czynsz: number
  subskrypcje: number
  dom: number
  inwestycje: number
  dostepne: number
}

export interface InvoiceAllocation {
  invoiceId: string
  invoiceNumber: string
  invoiceDate: string
  clientName: string
  invoiceNetto: number
  koperty: Koperty
  savedToSheets: boolean
}

export interface MonthlySummary {
  month: string  // "2025-01"
  totalRevenue: number
  totalExpenses: number
  taxableIncome: number
  estimatedTax: number
  zusTotal: number
  invoiceCount: number
}

export interface TaxResult {
  dochod: number
  skladkaZdrowotna: number
  podatek: number
  zusSpołeczne: number
  totalObciazenie: number
}

export type ConnectionStatus = 'idle' | 'testing' | 'ok' | 'error'

export interface IpcResult<T> {
  ok: boolean
  data?: T
  error?: string
}
