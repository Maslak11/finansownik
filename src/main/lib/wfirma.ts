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
    console.error('[wFirma] HTTP error', res.status, text.slice(0, 400))
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
    // API zwróciło XML lub inną odpowiedź mimo statusu 200
    console.error('[wFirma] Non-JSON response:', JSON.stringify(text.slice(0, 600)))
    const xmlCode = text.match(/<code>([^<]+)<\/code>/)?.[1]
    const xmlMsg = text.match(/<message>([^<]+)<\/message>/)?.[1]
    const anyTag = text.match(/<(\w+)>([^<]{1,100})<\/\1>/)?.[2]
    throw new Error(xmlMsg ?? xmlCode ?? anyTag ?? `Nieoczekiwana odpowiedź (${res.status}): ${text.slice(0, 300)}`)
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
 * Obsługuje też: tablicę, { invoice: [] }, { invoice: {} }
 */
function normalizeList(raw: unknown, itemKey: string): Record<string, unknown>[] {
  if (!raw) return []

  // Tablica: [{invoice:{...}}, ...]
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      const obj = item as Record<string, unknown>
      return (obj[itemKey] ?? obj) as Record<string, unknown>
    })
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const keys = Object.keys(obj)

    // Główny format wFirma: {"0":{invoice:{...}},"1":{invoice:{...}},...}
    // Obiekt może też mieć inne klucze (np. invoice_count, page) — wybieramy TYLKO numeryczne
    const numericKeys = keys.filter(k => /^\d+$/.test(k))
    if (numericKeys.length > 0) {
      return numericKeys.map(k => {
        const item = obj[k] as Record<string, unknown>
        return (item[itemKey] ?? item) as Record<string, unknown>
      })
    }

    // Fallback: { invoice: [{...}] } lub { invoice: {...} }
    const inner = obj[itemKey]
    if (Array.isArray(inner)) return inner as Record<string, unknown>[]
    if (inner && typeof inner === 'object') return [inner as Record<string, unknown>]
  }

  return []
}

export async function fetchInvoices(
  credentials: WfirmaCredentials,
  dateFrom: string,
  dateTo: string
): Promise<Invoice[]> {
  console.log('[wFirma] fetchInvoices', dateFrom, '->', dateTo)

  const response = await wfirmaPost<Record<string, unknown>>({
    credentials,
    endpoint: 'invoices/find',
    body: {
      invoices: {
        parameters: {
          page: 1,
          limit: 500,
          order: [{ field: 'date', direction: 'DESC' }]
        }
      }
    }
  })

  console.log('[wFirma] invoices response keys:', Object.keys(response))
  console.log('[wFirma] invoices raw type:', typeof response['invoices'], Array.isArray(response['invoices']) ? 'array' : '')
  const rawSnippet = JSON.stringify(response['invoices'])?.slice(0, 300)
  console.log('[wFirma] invoices raw snippet:', rawSnippet)

  const invoices = normalizeList(response['invoices'], 'invoice')
  console.log('[wFirma] normalized count:', invoices.length)

  const mapped = invoices.map((inv) => {
    const contractor = inv['contractor'] as Record<string, unknown> | undefined
    const paid = inv['paymentstate'] === 'paid' || inv['payment_state'] === 'paid'
    const netto = parseFloat(String(inv['netto'] ?? '0'))
    const brutto = parseFloat(String(inv['gross'] ?? inv['total'] ?? inv['brutto'] ?? '0'))
    // wFirma nie zawsze zwraca pole 'vat' — liczymy jako brutto - netto
    const vat = parseFloat(String(inv['vat'] ?? inv['tax'] ?? '0')) || Math.round((brutto - netto) * 100) / 100
    return {
      id: String(inv['id'] ?? ''),
      number: String(inv['fullnumber'] ?? inv['number'] ?? ''),
      date: String(inv['date'] ?? ''),
      clientName: String(contractor?.['name'] ?? ''),
      nettoAmount: netto,
      vatAmount: vat,
      bruttoAmount: brutto,
      paid
    } satisfies Invoice
  })

  const filtered = mapped
    .filter(inv => inv.date >= dateFrom && inv.date <= dateTo)
    // Odrzuć oferty (OF), proformy (PRO) i korekty do ofert — nie są przychodem
    .filter(inv => !/^(OF|PRO)\b/i.test(inv.number))

  console.log('[wFirma] after date+type filter:', filtered.length, 'of', mapped.length)
  return filtered
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
          page: 1,
          limit: 500,
          order: [{ field: 'date', direction: 'DESC' }]
        }
      }
    }
  })

  const expenses = normalizeList(response['expenses'], 'expense')

  const mapped = expenses.map((exp) => {
    // taxregister_date = data ujęcia w KPiR — to jest data którą wFirma używa
    // do przypisania kosztu do miesiąca. Jeśli brak, fallback na date.
    const taxDate = String(exp['taxregister_date'] ?? exp['date'] ?? '')
    const invoiceDate = String(exp['date'] ?? '')

    const netto = parseFloat(String(exp['netto'] ?? '0'))
    // wFirma może używać różnych nazw dla kwoty VAT na koszcie
    const gross = parseFloat(String(exp['gross'] ?? exp['brutto'] ?? exp['total'] ?? '0'))
    const vatDirect = parseFloat(String(
      exp['vat'] ?? exp['vat_netto'] ?? exp['vat_sum'] ?? exp['vat_total'] ?? '0'
    ))
    // Jeśli brak pola vat, oblicz z gross - netto (jak dla faktur)
    const vatAmount = vatDirect || (gross > 0 && gross > netto ? Math.round((gross - netto) * 100) / 100 : 0)

    // Kontrahent — obiekt z polem name lub sam string
    const contractorRaw = exp['contractor']
    const contractorName = typeof contractorRaw === 'object' && contractorRaw !== null
      ? String((contractorRaw as Record<string, unknown>)['name'] ?? '')
      : ''

    return {
      id: String(exp['id'] ?? ''),
      date: taxDate || invoiceDate,
      description: String(exp['name'] ?? exp['description'] ?? ''),
      contractorName,
      nettoAmount: netto,
      vatAmount,
      category: String(exp['category'] ?? '')
    } satisfies Expense
  })

  const filtered = mapped.filter(exp => exp.date >= dateFrom && exp.date <= dateTo)
  console.log('[wFirma] fetchExpenses', dateFrom, '->', dateTo, ':', filtered.length, 'of', mapped.length)
  return filtered
}

export async function testConnection(credentials: WfirmaCredentials): Promise<void> {
  await wfirmaPost({
    credentials,
    endpoint: 'invoices/find',
    body: { invoices: { parameters: { page: 1, limit: 1 } } }
  })
}
