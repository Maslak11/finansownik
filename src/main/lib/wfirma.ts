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

  const url = `${BASE_URL}/${endpoint}?accesskey=${encodeURIComponent(accessKey)}&secretkey=${encodeURIComponent(secretKey)}&appkey=${encodeURIComponent(appKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`wFirma API ${res.status}: ${text}`)
  }

  const json = await res.json() as Record<string, unknown>

  // wFirma zwraca {"status":{"code":"OK",...},...}
  const status = json['status'] as { code?: string; message?: string } | undefined
  if (status && status.code !== 'OK') {
    throw new Error(`wFirma błąd: ${status.message ?? JSON.stringify(status)}`)
  }

  return json as T
}

// Pobierz faktury sprzedaży z danego miesiąca
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
          conditions: {
            or: [{ date: { from: dateFrom, to: dateTo } }]
          },
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
      clientName: String(
        (inv['contractor'] as Record<string, unknown> | undefined)?.['name'] ?? ''
      ),
      nettoAmount: parseFloat(String(inv['netto'] ?? '0')),
      vatAmount: parseFloat(String(inv['vat'] ?? '0')),
      bruttoAmount: parseFloat(String(inv['gross'] ?? '0')),
      paid: inv['payment_state'] === 'paid'
    } satisfies Invoice
  })
}

// Pobierz koszty firmowe z danego okresu
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
            or: [{ date: { from: dateFrom, to: dateTo } }]
          },
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

// Test połączenia — pobierz jedną fakturę
export async function testConnection(credentials: WfirmaCredentials): Promise<void> {
  await wfirmaPost({
    credentials,
    endpoint: 'invoices/find',
    body: {
      invoices: {
        parameters: { page: 1, limit: 1 }
      }
    }
  })
}
