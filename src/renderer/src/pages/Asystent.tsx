import { useState, useEffect, useRef } from 'react'
import { Bot, Send, RefreshCw, AlertCircle, Sparkles, Trash2 } from 'lucide-react'
import { useAppContext } from '../App'
import { ipc } from '../lib/ipc'
import { calculateTax } from '../lib/tax'
import type { Invoice, Expense, FinancialContext, ChatMessage } from '../lib/types'

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function currentMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const lastDay = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return {
    dateFrom: `${y}-${mm}-01`,
    dateTo: `${y}-${mm}-${lastDay}`,
    label: `${mm}/${y}`
  }
}

const QUICK_PROMPTS = [
  'Co warto kupić przed końcem miesiąca, żeby zmniejszyć podatek?',
  'Ile kosztów firmowych mogę jeszcze odliczyć w tym miesiącu?',
  'Oceń moją sytuację podatkową i co mogę poprawić.',
  'Zaproponuj 3-5 sensownych zakupów firmowych dla developera/IT.'
]

export default function Asystent() {
  const { config, configLoaded } = useAppContext()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const range = currentMonthRange()
  const hasWfirma = !!config.wfirma.accessKey
  const hasGemini = !!(config.geminiApiKey ?? '').trim()

  useEffect(() => {
    if (configLoaded && hasWfirma) loadData()
  }, [configLoaded])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, asking])

  async function loadData() {
    setDataLoading(true)
    try {
      const [inv, exp] = await Promise.all([
        ipc.getInvoices(config.wfirma, range.dateFrom, range.dateTo),
        ipc.getExpenses(config.wfirma, range.dateFrom, range.dateTo)
      ])
      setInvoices(inv)
      setExpenses(exp)
    } catch { /* niezalogowany błąd wFirma */ } finally {
      setDataLoading(false)
    }
  }

  const monthRevenue = invoices.reduce((s, i) => s + i.nettoAmount, 0)
  const monthExpenses = expenses.reduce((s, e) => s + e.nettoAmount, 0)
  const taxResult = calculateTax(monthRevenue, monthExpenses, config)

  const context: FinancialContext = {
    month: range.label,
    revenue: monthRevenue,
    expenses: monthExpenses,
    dochod: taxResult.dochod,
    podatek: taxResult.podatek,
    skladkaZdrowotna: taxResult.skladkaZdrowotna,
    zusSpołeczne: taxResult.zusSpołeczne,
    totalObciazenie: taxResult.totalObciazenie
  }

  async function sendMessage(text: string) {
    if (!text.trim() || asking || !hasGemini) return
    setError('')
    const userMsg: ChatMessage = { role: 'user', text: text.trim() }
    const nextHistory = [...messages, userMsg]
    setMessages(nextHistory)
    setInput('')
    setAsking(true)
    try {
      // Przekaż historię BEZ ostatniej wiadomości użytkownika (jest w osobnym arg)
      const reply = await ipc.askAi(
        config.geminiApiKey,
        text.trim(),
        context,
        messages  // historia bez bieżącej wiadomości
      )
      setMessages([...nextHistory, { role: 'model', text: reply }])
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      // Cofnij ostatnią wiadomość użytkownika jeśli błąd
      setMessages(messages)
    } finally {
      setAsking(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  if (!hasGemini) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-violet-100 rounded-xl">
            <Bot size={22} className="text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Asystent AI</h1>
            <p className="text-slate-500 text-sm">Doradca podatkowy oparty na Gemini</p>
          </div>
        </div>
        <div className="card p-10 text-center space-y-4">
          <div className="p-4 bg-violet-50 rounded-full w-fit mx-auto">
            <Bot size={36} className="text-violet-300" />
          </div>
          <div>
            <p className="font-semibold text-slate-700 text-lg">Brak klucza Gemini API</p>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Dodaj klucz Gemini API w <strong>Ustawieniach</strong>, aby korzystać z asystenta.
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 text-left text-sm text-slate-600 max-w-sm mx-auto space-y-1.5">
            <p className="font-medium text-slate-700">Jak uzyskać klucz (bezpłatnie):</p>
            <p>1. Wejdź na <strong>aistudio.google.com</strong></p>
            <p>2. Kliknij "Get API key" → "Create API key"</p>
            <p>3. Skopiuj klucz i wklej w Ustawieniach</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-100 bg-white flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-lg">
              <Bot size={18} className="text-violet-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Asystent AI — optymalizacja podatkowa</h1>
              <p className="text-slate-400 text-xs mt-0.5">
                {hasWfirma && !dataLoading
                  ? <>
                      {range.label} · przychód <strong className="text-slate-600">{fmt(monthRevenue)} zł</strong>
                      {' · '}koszty <strong className="text-slate-600">{fmt(monthExpenses)} zł</strong>
                      {' · '}PIT ~<strong className="text-red-600">{fmt(taxResult.podatek)} zł</strong>
                    </>
                  : dataLoading ? 'Ładowanie danych z wFirma…' : `Miesiąc ${range.label} · brak danych wFirma`
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setError('') }}
                className="btn-ghost text-xs flex items-center gap-1 text-slate-400"
                title="Wyczyść rozmowę"
              >
                <Trash2 size={13} /> Wyczyść
              </button>
            )}
            {hasWfirma && (
              <button onClick={loadData} disabled={dataLoading} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
                <RefreshCw size={13} className={dataLoading ? 'animate-spin' : ''} />
                Odśwież
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-3xl mx-auto space-y-4">

          {/* Puste — szybkie pytania */}
          {messages.length === 0 && (
            <div className="space-y-5">
              <div className="text-center py-4">
                <div className="p-3 bg-violet-50 rounded-full w-fit mx-auto mb-3">
                  <Sparkles size={20} className="text-violet-500" />
                </div>
                <p className="text-slate-500 text-sm">Zacznij od gotowego pytania lub napisz własne</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    disabled={asking}
                    className="text-left text-sm p-3.5 rounded-xl border border-slate-200 bg-white hover:bg-violet-50 hover:border-violet-300 transition-colors text-slate-600 leading-snug"
                  >
                    <Sparkles size={12} className="inline mr-1.5 text-violet-400 flex-shrink-0" />
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Wiadomości */}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-violet-600 text-white rounded-br-md'
                  : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-sm'
              }`}>
                {msg.role === 'model' && (
                  <div className="flex items-center gap-1.5 mb-2 text-violet-500 text-xs font-semibold">
                    <Bot size={12} /> Asystent
                  </div>
                )}
                <span className="whitespace-pre-wrap">{msg.text}</span>
              </div>
            </div>
          ))}

          {/* Ładowanie */}
          {asking && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm flex items-center gap-2.5">
                <div className="flex gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
                <span className="text-sm text-slate-400">Analizuję…</span>
              </div>
            </div>
          )}

          {/* Błąd */}
          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-6 pb-5 pt-3 border-t border-slate-100 bg-white flex-shrink-0">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            placeholder="Zapytaj o zakupy, optymalizację podatku, koszty firmowe…"
            disabled={asking}
            className="input flex-1"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || asking}
            className="btn-primary flex items-center gap-2 px-5"
          >
            <Send size={15} />
            Wyślij
          </button>
        </div>
        <p className="max-w-3xl mx-auto mt-1.5 text-xs text-slate-400">
          AI może się mylić — przy decyzjach podatkowych skonsultuj się z księgowym.
        </p>
      </div>
    </div>
  )
}
