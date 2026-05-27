import { google } from 'googleapis'
import type { InvoiceAllocation, AppConfig, MonthlySummary, SheetsCredentials } from '../../shared/types'

function getSheets(serviceAccountJson: string) {
  const key = JSON.parse(serviceAccountJson) as {
    client_email: string
    private_key: string
  }

  const auth = new google.auth.JWT(key.client_email, undefined, key.private_key, [
    'https://www.googleapis.com/auth/spreadsheets'
  ])

  return google.sheets({ version: 'v4', auth })
}

// Odczytaj konfigurację z zakładki "Konfiguracja" (kolumny A=klucz, B=wartość)
export async function readConfigFromSheets(
  creds: SheetsCredentials
): Promise<Partial<AppConfig>> {
  const sheets = getSheets(creds.serviceAccountJson)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: creds.spreadsheetId,
    range: 'Konfiguracja!A:B'
  })

  const rows = res.data.values ?? []
  const map: Record<string, string> = {}
  for (const row of rows) {
    if (row[0] && row[1]) map[String(row[0])] = String(row[1])
  }

  // Parsuj konfigurację ze znanych kluczy
  const partial: Partial<AppConfig> = {}

  if (map['pit_rate']) {
    partial.tax = {
      pitRate: parseFloat(map['pit_rate']) || 0.19,
      zusSpołeczne: parseFloat(map['zus_spoleczne'] ?? '1773') || 1773,
      zusZdrowotnaMin: parseFloat(map['zus_zdrowotna_min'] ?? '314') || 314,
      zusZdrowotnaRate: parseFloat(map['zus_zdrowotna_rate'] ?? '0.049') || 0.049
    }
  }

  if (map['dom_pct']) {
    partial.allocation = {
      dom: parseFloat(map['dom_pct']) || 15,
      inwestycje: parseFloat(map['inwestycje_pct'] ?? '5') || 5,
      avgInvoicesPerMonth: parseFloat(map['avg_invoices'] ?? '2') || 2
    }
  }

  if (map['czynsz']) partial.czynsz = parseFloat(map['czynsz']) || 0

  return partial
}

// Zapisz konfigurację do zakładki "Konfiguracja"
export async function writeConfigToSheets(
  creds: SheetsCredentials,
  config: AppConfig
): Promise<void> {
  const sheets = getSheets(creds.serviceAccountJson)

  const values = [
    ['pit_rate', config.tax.pitRate],
    ['zus_spoleczne', config.tax.zusSpołeczne],
    ['zus_zdrowotna_min', config.tax.zusZdrowotnaMin],
    ['zus_zdrowotna_rate', config.tax.zusZdrowotnaRate],
    ['dom_pct', config.allocation.dom],
    ['inwestycje_pct', config.allocation.inwestycje],
    ['avg_invoices', config.allocation.avgInvoicesPerMonth],
    ['czynsz', config.czynsz],
    ...config.fixedExpenses.map((e) => [`fixed_${e.id}`, `${e.name}:${e.amount}`])
  ]

  await sheets.spreadsheets.values.update({
    spreadsheetId: creds.spreadsheetId,
    range: 'Konfiguracja!A1',
    valueInputOption: 'RAW',
    requestBody: { values }
  })
}

// Zapisz alokację faktury do zakładki "Faktury"
export async function appendAllocationToSheets(
  creds: SheetsCredentials,
  alloc: InvoiceAllocation
): Promise<void> {
  const sheets = getSheets(creds.serviceAccountJson)

  const row = [
    alloc.invoiceDate,
    alloc.invoiceNumber,
    alloc.clientName,
    alloc.invoiceNetto,
    alloc.koperty.podatek,
    alloc.koperty.zus,
    alloc.koperty.czynsz,
    alloc.koperty.subskrypcje,
    alloc.koperty.raty,
    alloc.koperty.dom,
    alloc.koperty.inwestycje,
    alloc.koperty.dostepne,
    new Date().toISOString()
  ]

  await sheets.spreadsheets.values.append({
    spreadsheetId: creds.spreadsheetId,
    range: 'Faktury!A:L',
    valueInputOption: 'RAW',
    requestBody: { values: [row] }
  })
}

// Zapisz miesięczne podsumowanie do zakładki "Podsumowanie"
export async function appendSummaryToSheets(
  creds: SheetsCredentials,
  summary: MonthlySummary
): Promise<void> {
  const sheets = getSheets(creds.serviceAccountJson)

  const row = [
    summary.month,
    summary.totalRevenue,
    summary.totalExpenses,
    summary.taxableIncome,
    summary.estimatedTax,
    summary.zusTotal,
    summary.invoiceCount,
    new Date().toISOString()
  ]

  await sheets.spreadsheets.values.append({
    spreadsheetId: creds.spreadsheetId,
    range: 'Podsumowanie!A:H',
    valueInputOption: 'RAW',
    requestBody: { values: [row] }
  })
}

// Odczytaj historię alokacji
export async function readAllocationsFromSheets(
  creds: SheetsCredentials,
  month?: string
): Promise<InvoiceAllocation[]> {
  const sheets = getSheets(creds.serviceAccountJson)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: creds.spreadsheetId,
    range: 'Faktury!A:L'
  })

  const rows = (res.data.values ?? []).slice(1) // pomiń nagłówek

  return rows
    .filter((row) => !month || String(row[0]).startsWith(month))
    .map((row, i) => ({
      invoiceId: `sheets-${i}`,
      invoiceDate: String(row[0] ?? ''),
      invoiceNumber: String(row[1] ?? ''),
      clientName: String(row[2] ?? ''),
      invoiceNetto: parseFloat(String(row[3] ?? '0')),
      koperty: {
        podatek: parseFloat(String(row[4] ?? '0')),
        zus: parseFloat(String(row[5] ?? '0')),
        czynsz: parseFloat(String(row[6] ?? '0')),
        subskrypcje: parseFloat(String(row[7] ?? '0')),
        raty: parseFloat(String(row[8] ?? '0')),
        dom: parseFloat(String(row[9] ?? '0')),
        inwestycje: parseFloat(String(row[10] ?? '0')),
        dostepne: parseFloat(String(row[11] ?? '0'))
      },
      savedToSheets: true
    }))
}

// Test połączenia — sprawdź czy arkusz jest dostępny
export async function testSheetsConnection(creds: SheetsCredentials): Promise<string> {
  const sheets = getSheets(creds.serviceAccountJson)
  const res = await sheets.spreadsheets.get({ spreadsheetId: creds.spreadsheetId })
  return res.data.properties?.title ?? 'OK'
}

// Utwórz zakładki i nagłówki — bezpieczne przy pustym arkuszu
export async function initializeSheets(creds: SheetsCredentials): Promise<void> {
  const sheets = getSheets(creds.serviceAccountJson)

  const SHEET_HEADERS: Record<string, string[]> = {
    Faktury:       ['Data', 'Nr faktury', 'Kontrahent', 'Netto', 'Podatek', 'ZUS',
                    'Czynsz', 'Subskrypcje', 'Dom', 'Inwestycje', 'Dostępne', 'Zapisano'],
    Podsumowanie:  ['Miesiąc', 'Przychód', 'Koszty', 'Dochód', 'Podatek',
                    'ZUS łącznie', 'Liczba faktur', 'Zapisano'],
    Konfiguracja:  ['klucz', 'wartość'],
  }

  // 1. Pobierz listę istniejących zakładek
  const meta = await sheets.spreadsheets.get({ spreadsheetId: creds.spreadsheetId })
  const existing = new Set(
    (meta.data.sheets ?? []).map(s => s.properties?.title ?? '')
  )

  // 2. Utwórz brakujące zakładki jednym batch requestem
  const toCreate = Object.keys(SHEET_HEADERS).filter(name => !existing.has(name))
  if (toCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: creds.spreadsheetId,
      requestBody: {
        requests: toCreate.map(title => ({
          addSheet: { properties: { title } }
        }))
      }
    })
  }

  // 3. Wpisz nagłówki do każdej zakładki (wiersz 1)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: creds.spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: Object.entries(SHEET_HEADERS).map(([title, headers]) => ({
        range: `${title}!A1`,
        values: [headers]
      }))
    }
  })
}
