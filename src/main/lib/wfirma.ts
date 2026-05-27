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
    // API zwróciło XML lub inną odpowiedź — wyciągnij komunikat
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

export async function fetchInvoices(
  credentials: WfirmaCredentials,
  dateFrom: string,
  dateTo: string
): Promise<Invoice[]> {
  // wFirma API v2: conditions używa tablicy condition z operatorami ge/le
  const response = await wfirmaPost<Record<string, unknown>>({
    credentials,
    endpoint: 'invoices/find',
    body: {
      invoices: {
        parameters: {
          conditions: {
            condition: [
              { field: 'date', operator: 'ge', value: dateFrom },
              { field: 'date', operator: 'le', value: dateTo }
            ]
          },
          page: 1,
          limit: 100,
          order: [{ field: 'date', direction: 'DESC' }]
        }
      }
    }
  })

  // wFirma zwraca: { invoices: [ { invoice: {...} }, ... ], status: { code: 'OK' } }
  const raw = (response['invoices'] as Record<string, unknown>[] | undefined) ?? []
  return raw.map((item) => {
    // Każdy element to { invoice: { id, fullnumber, ... } }
    const inv = (item['invoice'] ?? item) as Record<string, unknown>
    const contractor = inv['contractor'] as Record<string, unknown> | undefined
    return {
      id: String(inv['id'] ?? ''),
      number: String(inv['fullnumber'] ?? inv['number'] ?? ''),
      date: String(inv['date'] ?? ''),
      clientName: String(contractor?.['name'] ?? ''),
      nettoAmount: parseFloat(String(inv['netto'] ?? '0')),
      vatAmount: parseFloat(String(inv['vat'] ?? '0')),
      bruttoAmount: parseFloat(String(inv['gross'] ?? inv['brutto'] ?? '0')),
      paid: inv['payment_state'] === 'paid'
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
          conditions: {
            condition: [
              { field: 'date', operator: 'ge', value: dateFrom },
              { field: 'date', operator: 'le', value: dateTo }
            ]
          },
          page: 1,
          limit: 200,
          order: [{ field: 'date', direction: 'DESC' }]
        }
      }
    }
  })

  // wFirma zwraca: { expenses: [ { expense: {...} }, ... ], status: { code: 'OK' } }
  const raw = (response['expenses'] as Record<string, unknown>[] | undefined) ?? []
  return raw.map((item) => {
    const exp = (item['expense'] ?? item) as Record<string, unknown>
    return {
      id: String(exp['id'] ?? ''),
      date: String(exp['date'] ?? ''),
      description: String(exp['name'] ?? exp['description'] ?? ''),
      nettoAmount: parseFloat(String(exp['netto'] ?? '0')),
      category: String(exp['category'] ?? '')
    } satisfies Expense
  })
}

export async function testConnection(credentials: WfirmaCredentials): Promise<void> {
  await wfirmaPost({
    credentials,
    endpoint: 'invoices/find',
    body: { invoices: { parameters: { page: 1, limit: 1 } } }
  })
}
