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
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
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
    throw new Error(xmlMsg ?? xmlCode ?? `wFirma API ${res.status}`)
  }

  // Parsuj JSON
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    const xmlCode = text.match(/<code>([^<]+)<\/code>/)?.[1]
    const xmlMsg = text.match(/<message>([^<]+)<\/message>/)?.[1]
    throw new Error(xmlMsg ?? xmlCode ?? `Nieoczekiwana odpowiedź: ${text.slice(0, 200)}`)
  }

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

  const raw = (response['invoices'] as Record<string, unknown>[] | undefined) ?? []
  return raw.map((item) => {
    const inv = item as Record<string, unknown>
    return {
      id: String(inv['id'] ?? ''),
      number: String(inv['fullnumber'] ?? inv['number'] ?? ''),
      date: String(inv['date'] ?? ''),
      clientName: String((inv['contractor'] as Record<string, unknown> | undefined)?.['name'] ?? ''),
      nettoAmount: parseFloat(String(inv['netto'] ?? '0')),
      vatAmount: parseFloat(String(inv['vat'] ?? '0')),
      bruttoAmount: parseFloat(String(inv['gross'] ?? '0')),
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
          conditions: { or: [{ date: { from: dateFrom, to: dateTo } }] },
          page: 1,
          limit: 200
        }
      }
    }
  })

  const raw = (response['expenses'] as Record<string, unknown>[] | undefined) ?? []
  return raw.map((item) => {
    const exp = item as Record<string, unknown>
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
