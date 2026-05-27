import type { FinancialContext, ChatMessage } from '../../shared/types'

type GeminiContent = { role: 'user' | 'model'; parts: { text: string }[] }

function fmt(n: number): string {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildSystemPrompt(ctx: FinancialContext): string {
  const oszczednoscNa100 = Math.round(ctx.podatek > 0 && ctx.dochod > 0
    ? (ctx.podatek / ctx.dochod) * 100
    : 19)

  return `Jesteś asystentem finansowym dla polskiego freelancera (JDG, podatek liniowy 19%).

DANE FINANSOWE — ${ctx.month}:
- Przychód netto: ${fmt(ctx.revenue)} zł
- Koszty firmowe (KPiR): ${fmt(ctx.expenses)} zł
- ZUS społeczne: ${fmt(ctx.zusSpołeczne)} zł
- Dochód podatkowy: ${fmt(ctx.dochod)} zł
- Szacowany PIT 19%: ${fmt(ctx.podatek)} zł
- Składka zdrowotna (4,9% dochodu): ${fmt(ctx.skladkaZdrowotna)} zł
- Łącznie do zapłaty (PIT + ZUS + zdrowotna): ${fmt(ctx.totalObciazenie)} zł

KLUCZOWA ZASADA: każde 100 zł kosztu firmowego oszczędza ok. ${oszczednoscNa100} zł podatku PIT (a dodatkowo zmniejsza składkę zdrowotną).

ODPOWIADAJ:
- Tylko po polsku, konkretnie i rzeczowo
- Podawaj kwoty w zł i % oszczędności
- Dla każdego sugerowanego zakupu pokaż: cena X zł → oszczędność ~${oszczednoscNa100}% = Y zł → realny koszt Z zł
- Typowe koszty firmowe JDG/IT: sprzęt komputerowy, oprogramowanie/licencje, kursy/szkolenia/konferencje, telefon + internet, home office (proporcja), biurko/krzesło, subskrypcje SaaS, książki branżowe, leasing samochodu
- Nie dawaj porad prawnych — przy wątpliwościach odsyłaj do księgowego
- Bądź zwięzły: max 5-8 zdań lub lista punktów`
}

export async function askGemini(
  apiKey: string,
  userMessage: string,
  context: FinancialContext,
  history: ChatMessage[] = []
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context)

  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    {
      role: 'model',
      parts: [{ text: 'Rozumiem Twoją sytuację finansową. Jestem gotowy pomagać w optymalizacji podatkowej.' }]
    },
    ...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: userMessage }] }
  ]

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1200
      }
    })
  })

  const text = await res.text()

  if (!res.ok) {
    let errMsg = `Gemini API ${res.status}`
    try {
      const json = JSON.parse(text) as { error?: { message?: string } }
      if (json.error?.message) errMsg = json.error.message
    } catch { /* ignore */ }
    throw new Error(errMsg)
  }

  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('Nieprawidłowa odpowiedź od Gemini API')
  }

  type Candidates = { content?: { parts?: { text?: string }[] } }[]
  const candidates = json['candidates'] as Candidates | undefined
  const reply = candidates?.[0]?.content?.parts?.[0]?.text
  if (!reply) throw new Error('Brak treści w odpowiedzi Gemini')

  return reply
}
