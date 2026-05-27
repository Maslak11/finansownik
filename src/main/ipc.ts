import { ipcMain } from 'electron'
import { getConfig, saveConfig, getConfigPath } from './lib/config-store'
import { fetchInvoices, fetchExpenses, testConnection as testWfirma } from './lib/wfirma'
import {
  appendAllocationToSheets,
  appendSummaryToSheets,
  readAllocationsFromSheets,
  testSheetsConnection,
  initializeSheets,
  writeConfigToSheets
} from './lib/sheets'
import {
  getAll as getManualInvoices,
  save as saveManualInvoice,
  saveMany as saveManyManualInvoices,
  remove as removeManualInvoice,
  parseCSVRow
} from './lib/manual-invoices'
import type { AppConfig, Invoice, InvoiceAllocation, MonthlySummary } from '../shared/types'

function handle<T>(
  channel: string,
  handler: (args: T) => Promise<unknown>
): void {
  ipcMain.handle(channel, async (_event, args: T) => {
    try {
      const data = await handler(args)
      return { ok: true, data }
    } catch (err) {
      console.error(`[IPC] ${channel} error:`, err)
      return { ok: false, error: String(err instanceof Error ? err.message : err) }
    }
  })
}

export function registerIpcHandlers(): void {
  // --- Konfiguracja ---
  handle('config:get', async () => getConfig())
  handle('config:save', async (config: AppConfig) => {
    saveConfig(config)
    return true
  })
  handle('config:getPath', async () => getConfigPath())

  // --- wFirma ---
  handle('wfirma:testConnection', async (creds: AppConfig['wfirma']) => {
    await testWfirma(creds)
    return true
  })

  handle(
    'wfirma:getInvoices',
    async ({ credentials, dateFrom, dateTo }: {
      credentials: AppConfig['wfirma']
      dateFrom: string
      dateTo: string
    }) => fetchInvoices(credentials, dateFrom, dateTo)
  )

  handle(
    'wfirma:getExpenses',
    async ({ credentials, dateFrom, dateTo }: {
      credentials: AppConfig['wfirma']
      dateFrom: string
      dateTo: string
    }) => fetchExpenses(credentials, dateFrom, dateTo)
  )

  // --- Google Sheets ---
  handle('sheets:testConnection', async (creds: AppConfig['sheets']) => {
    const title = await testSheetsConnection(creds)
    return title
  })

  handle('sheets:initialize', async (creds: AppConfig['sheets']) => {
    await initializeSheets(creds)
    return true
  })

  handle('sheets:saveConfig', async ({ creds, config }: {
    creds: AppConfig['sheets']
    config: AppConfig
  }) => {
    await writeConfigToSheets(creds, config)
    return true
  })

  handle('sheets:saveAllocation', async ({ creds, allocation }: {
    creds: AppConfig['sheets']
    allocation: InvoiceAllocation
  }) => {
    await appendAllocationToSheets(creds, allocation)
    return true
  })

  handle('sheets:saveSummary', async ({ creds, summary }: {
    creds: AppConfig['sheets']
    summary: MonthlySummary
  }) => {
    await appendSummaryToSheets(creds, summary)
    return true
  })

  handle('sheets:getAllocations', async ({ creds, month }: {
    creds: AppConfig['sheets']
    month?: string
  }) => readAllocationsFromSheets(creds, month))

  // --- Ręczne faktury (local electron-store) ---
  handle('manual:getAll', async () => getManualInvoices())

  handle('manual:save', async (invoice: Invoice) => {
    saveManualInvoice(invoice)
    return true
  })

  handle('manual:delete', async (id: string) => {
    removeManualInvoice(id)
    return true
  })

  handle('manual:importCSV', async ({ csvText }: { csvText: string }) => {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim())
    if (lines.length < 2) throw new Error('Plik CSV jest pusty lub zawiera tylko nagłówek.')

    // Wykryj separator (przecinek lub średnik)
    const sep = lines[0].includes(';') ? ';' : ','

    const splitLine = (line: string): string[] => {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; continue }
        if (char === sep && !inQuotes) { result.push(current); current = ''; continue }
        current += char
      }
      result.push(current)
      return result
    }

    const headers = splitLine(lines[0])
    const imported: Invoice[] = []

    for (const line of lines.slice(1)) {
      if (!line.trim()) continue
      const row = splitLine(line)
      const invoice = parseCSVRow(headers, row)
      if (invoice) imported.push(invoice)
    }

    if (imported.length === 0) throw new Error('Nie znaleziono poprawnych faktur w pliku CSV. Sprawdź nagłówki kolumn.')
    saveManyManualInvoices(imported)
    return imported.length
  })
}
