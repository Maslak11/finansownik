import type { Invoice, Expense, WfirmaCredentials } from '../../shared/types'

const BASE_URL = 'https://api2.wfirma.pl'

interface WfirmaRequestOptions {
  credentials: WfirmaCredentials
  endpoint: string
  body: object
}

function basicAuth(accessKey: string, secretKey: string): string {
  return 'Basic ' + Buffer.from(`${accessKey}:${secretKey}`).toString('base64')
}

async function wfirmaPost<T>(opts: WfirmaRequestOptions): Promise<T> {
  const { credentials, endpoint, body } = opts
  const { accessKey, secretKey } = credentials

  const url = `${BASE_URL}/${endpoint}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': basicAuth(accessKey, secretKey)
    },
    body: JSON.stringify(body)
  })

  const text = await res.text()

  if (!res.ok) {
    // Wyciągnij <code> z XML jeśli odpowiedź to XML
    const xmlCode = text.match(/<code>([^<]+)<\/code>/)?.[1]
    const msg = xmlCode === 'AUTH'
      ? 'Nieprawidłowe klucze API (AUTH). Sprawdź Access Key i Secret Key.'
      : xmlCode
      ? `wFirma błąd: ${xmlCode}`
      : `wFirma API ${res.status}: ${text.slice(0, 200)}`
    throw new Error(msg)
  }

  // Parsuj JSON
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    // API zwróciło XML zamiast JSON — wyciągnij kod błędu
    const xmlCode = text.match(/<code>([^<]+)<\/code>/)?.[1]
    throw new Error(xmlCode ? `wFirma błąd: ${xmlCode}` : `Nieoczekiwana odpowiedź API: ${text.slice(0, 200)}`)
  }

  // wFirma zwraca {"status":{"code":"OK"},...}
  const status = json['status'] as { code?: string; message?: string } | undefined
  if (status && status.code !== 'OK') {
    throw new Error(`wFirma błąd: ${status.message ?? status.code}`)
  }

  return json as T
}

// Pobierz faktury sprzedaży z danego okresu
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
