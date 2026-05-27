import type { Koperty } from '../lib/types'

const COLORS: Record<keyof Koperty, string> = {
  podatek: 'bg-red-500',
  zus: 'bg-orange-400',
  czynsz: 'bg-yellow-400',
  subskrypcje: 'bg-purple-400',
  raty: 'bg-pink-400',
  dom: 'bg-blue-400',
  inwestycje: 'bg-emerald-400',
  dostepne: 'bg-slate-300'
}

const LABELS: Record<keyof Koperty, string> = {
  podatek: 'Podatek PIT',
  zus: 'ZUS',
  czynsz: 'Czynsz',
  subskrypcje: 'Subskrypcje',
  raty: 'Raty i kredyty',
  dom: 'Dom',
  inwestycje: 'Inwestycje',
  dostepne: 'Do dyspozycji'
}

interface Props {
  koperty: Koperty
  total: number
  compact?: boolean
}

export default function KopertaBar({ koperty, total, compact = false }: Props) {
  if (total <= 0) return null

  const keys = Object.keys(koperty) as Array<keyof Koperty>

  return (
    <div className="space-y-2">
      {/* Pasek postępu */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {keys.map((key) => {
          const val = koperty[key]
          if (val <= 0) return null
          const pct = (val / total) * 100
          return (
            <div
              key={key}
              className={`${COLORS[key]} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${LABELS[key]}: ${fmt(val)} zł (${pct.toFixed(1)}%)`}
            />
          )
        })}
      </div>

      {/* Legenda */}
      {!compact && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {keys.map((key) => {
            const val = koperty[key]
            const pct = ((val / total) * 100).toFixed(1)
            return (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className={`w-2 h-2 rounded-full ${COLORS[key]}`} />
                  {LABELS[key]}
                </span>
                <span className="font-medium text-slate-800 tabular-nums">
                  {fmt(val)} zł
                  <span className="text-slate-400 ml-1">({pct}%)</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function fmt(n: number): string {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
