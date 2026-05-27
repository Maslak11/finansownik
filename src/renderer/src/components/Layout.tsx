import { NavLink } from 'react-router-dom'
import { LayoutDashboard, FileText, Calculator, Settings, Receipt } from 'lucide-react'
import type { ReactNode } from 'react'

const nav = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/faktury', label: 'Faktury', Icon: FileText },
  { to: '/podatek', label: 'Podatek i ZUS', Icon: Receipt },
  { to: '/kalkulator', label: 'Kalkulator kosztów', Icon: Calculator },
  { to: '/ustawienia', label: 'Ustawienia', Icon: Settings }
]

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-700">
          <span className="text-white font-bold text-lg tracking-tight">finansownik</span>
          <p className="text-slate-400 text-xs mt-0.5">kalkulator JDG</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-slate-700">
          <p className="text-slate-500 text-xs">Podatek liniowy 19% · pełny ZUS</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
