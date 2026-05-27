import type { Invoice, Expense, WfirmaCredentials } from '../../shared/types'

const BASE_URL = 'https://api2.wfirma.pl'

interface WfirmaRequestOptions {
  credentials: WfirmaCredentials
  endpoint: string
  body: object
}

async function wfirmaPost<T>(opts: WfirmaRequestOptions): Promise<T> {
  const { credentials, endpoint, body } = opts
  const { accessKey, secretKey, appKey } = credentials

  // wFirma API Key auth: trzy dedykowane nagłówki HTTP
  // inputFormat/outputFormat=json wymagane — API domyślnie używa XML
  const res = await fetch(`${BASE_URL}/${endpoint}?inputFormat=json&outputFormat=json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'accessKey': accessKey,
      'secretKey': secretKey,
      'appKey': appKey
    },
    body: JSON.stringify(body)
  })

  const text = await res.text()

  if (!res.ok) {
    const xmlCode = text.match(/<code>([^<]+)<\/code>/)?.[1]
    const xmlMsg = text.match(/<message>([^<]+)<\/message>/)?.[1]
    if (xmlCode === 'AUTH') throw new Error('Nieprawidłowe klucze API. Sprawdź accessKey, secretKey i appKey.')
    throw new Error(xmlMsg ?? xmlCode ?? `wFirma API ${res.status}: ${text.slice(0, 300)}`)
  }

  // Próbuj parsować JSON
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    const xmlCode = text.match(/<code>([^<]+)<\/code>/)?.[1]
    const xmlMsg = text.match(/<message>([^<]+)<\/message>/)?.[1]
    throw new Error(xmlMsg ?? xmlCode ?? `Nieoczekiwana odpowiedź (${res.status}): ${text.slice(0, 300)}`)
  }

  // Sprawdź status w JSON
  const status = json['status'] as { code?: string; message?: string } | undefined
  if (status && status.code !== 'OK') {
    throw new Error(status.message ?? `wFirma błąd: ${status.code}`)
  }

  return json as T
}

/**
 * wFirma zwraca listy jako obiekt z kluczami numerycznymi:
 *   { "0": { invoice: {...} }, "1": { invoice: {...} }, ... }
 *
 * Obsługuje też inne warianty na wszelki wypadek:
 *   - tablica [ { invoice: {...} }, ... ]
 *   - { invoice: [ {...} ] }
 *   - { invoice: {...} }
 */
function normalizeList(raw: unknown, itemKey: string): Record<string, unknown>[] {
  if (!raw) return []

  // Tablica — iterujemy i odpkowujemy itemKey
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      const obj = item as Record<string, unknown>
      return (obj[itemKey] ?? obj) as Record<string, unknown>
    })
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const keys = Object.keys(obj)

    // Obiekt z kluczami numerycznymi: { "0": { invoice: {...} }, "1": ... }
    // To jest główny format zwracany przez wFirma API
    if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
      return Object.values(obj).map((item) => {
        const itemObj = item as Record<string, unknown>
        return (itemObj[itemKey] ?? itemObj) as Record<string, unknown>
      })
    }

    // Obiekt { invoice: [...] }
    const inner = obj[itemKey]
    if (Array.isArray(inner)) {
      return inner as Record<string, unknown>[]
    }
    // Obiekt { invoice: {...} } — jeden element
    if (inner && typeof inner === 'object') {
      return [inner as Record<string, unknown>]
    }
  }

  return []
}

export async function fetchInvoices(
  credentials: WfirmaCredentials,
  dateFrom: string,
  dateTo: string
): Promise<Invoice[]> {
  const response = await wfirmaPost<Record<string, unknown>>({
    credentials,
    endpoint: 'invoices/find',
    body: {
      invoices: {
        parameters: {
          conditions: { or: [{ date: { from: dateFrom, to: dateTo } }] },
          page: 1,
          limit: 100,
          order: [{ field: 'date', direction: 'DESC' }]
        }
      }
    }
  })

  const invoices = normalizeList(response['invoices'], 'invoice')

  return invoices.map((inv) => {
    const contractor = inv['contractor'] as Record<string, unknown> | undefined
    // wFirma używa 'paymentstate' (bez podkreślnika) i 'total' jako gross
    const paid = inv['paymentstate'] === 'paid' || inv['payment_state'] === 'paid'
    return {
      id: String(inv['id'] ?? ''),
      number: String(inv['fullnumber'] ?? inv['number'] ?? ''),
      date: String(inv['date'] ?? ''),
      clientName: String(contractor?.['name'] ?? ''),
      nettoAmount: parseFloat(String(inv['netto'] ?? '0')),
      vatAmount: parseFloat(String(inv['vat'] ?? '0')),
      bruttoAmount: parseFloat(String(inv['gross'] ?? inv['total'] ?? inv['brutto'] ?? '0')),
      paid
    } satisfies Invoice
  })
}

export async function fetchExpenses(
  credentials: WfirmaCredentials,
  dateFrom: string,
  dateTo: string
): Promise<Expense[]> {
  const response = await wfirmaPost<Record<string, unknown>>({
    credentials,
    endpoint: 'expenses/find',
    body: {
      expenses: {
        parameters: {
          conditions: { or: [{ date: { from: dateFrom, to: dateTo } }] },
          page: 1,
          limit: 200,
          order: [{ field: 'date', direction: 'DESC' }]
        }
      }
    }
  })

  const expenses = normalizeList(response['expenses'], 'expense')

  return expenses.map((exp) => ({
    id: String(exp['id'] ?? ''),
    date: String(exp['date'] ?? ''),
    description: String(exp['name'] ?? exp['description'] ?? ''),
    nettoAmount: parseFloat(String(exp['netto'] ?? '0')),
    category: String(exp['category'] ?? '')
  } satisfies Expense))
}

export async function testConnection(credentials: WfirmaCredentials): Promise<void> {
  await wfirmaPost({
    credentials,
    endpoint: 'invoices/find',
    body: { invoices: { parameters: { page: 1, limit: 1 } } }
  })
}
