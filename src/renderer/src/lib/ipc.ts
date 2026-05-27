import type { AppConfig, Invoice, Expense, InvoiceAllocation, MonthlySummary, IpcResult } from './types'

declare global {
  interface Window {
    api: {
      invoke: (channel: string, args?: unknown) => Promise<IpcResult<unknown>>
    }
  }
}

async function invoke<T>(channel: string, args?: unknown): Promise<T> {
  const result = await window.api.invoke(channel, args)
  if (!result.ok) throw new Error(result.error ?? 'Nieznany błąd')
  return result.data as T
}

export const ipc = {
  // Config
  getConfig: () => invoke<AppConfig>('config:get'),
  saveConfig: (config: AppConfig) => invoke<boolean>('config:save', config),
  getConfigPath: () => invoke<string>('config:getPath'),

  // wFirma
  testWfirma: (creds: AppConfig['wfirma']) =>
    invoke<boolean>('wfirma:testConnection', creds),
  getInvoices: (credentials: AppConfig['wfirma'], dateFrom: string, dateTo: string) =>
    invoke<Invoice[]>('wfirma:getInvoices', { credentials, dateFrom, dateTo }),
  getExpenses: (credentials: AppConfig['wfirma'], dateFrom: string, dateTo: string) =>
    invoke<Expense[]>('wfirma:getExpenses', { credentials, dateFrom, dateTo }),

  // Sheets
  testSheets: (creds: AppConfig['sheets']) =>
    invoke<string>('sheets:testConnection', creds),
  initSheets: (creds: AppConfig['sheets']) =>
    invoke<boolean>('sheets:initialize', creds),
  saveSheetConfig: (creds: AppConfig['sheets'], config: AppConfig) =>
    invoke<boolean>('sheets:saveConfig', { creds, config }),
  saveAllocation: (creds: AppConfig['sheets'], allocation: InvoiceAllocation) =>
    invoke<boolean>('sheets:saveAllocation', { creds, allocation }),
  saveSummary: (creds: AppConfig['sheets'], summary: MonthlySummary) =>
    invoke<boolean>('sheets:saveSummary', { creds, summary }),
  getAllocations: (creds: AppConfig['sheets'], month?: string) =>
    invoke<InvoiceAllocation[]>('sheets:getAllocations', { creds, month })
}
