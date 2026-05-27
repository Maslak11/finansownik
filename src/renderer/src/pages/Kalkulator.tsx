import { useState } from 'react'
import { useAppContext } from '../App'

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface CostResult {
  zakupBrutto: number
  vat: number
  nettoKoszt: number
  oszczednoscPodatkowa: number
  realnyKosztFirmowy: number
  realnyKosztPrywatny: number
  oplaca: boolean
  roznica: number
}

function calcCostBenefit(
  brutto: number,
  vatRate: number,
  pitRate: number
): CostResult {
  const vat = brutto * (vatRate / (1 + vatRate))
  const netto = brutto - vat
  const oszczednoscPodatkowa = netto * pitRate
  const realnyKosztFirmowy = brutto - vat - oszczednoscPodatkowa  // VAT odliczony + koszt zmniejsza PIT
  const realnyKosztPrywatny = brutto  // płacisz pełne brutto z opodatkowanego dochodu

  return {
    zakupBrutto: brutto,
    vat: round2(vat),
    nettoKoszt: round2(netto),
    oszczednoscPodatkowa: round2(oszczednoscPodatkowa),
    realnyKosztFirmowy: round2(realnyKosztFirmowy),
    realnyKosztPrywatny: round2(realnyKosztPrywatny),
    oplaca: realnyKosztFirmowy < realnyKosztPrywatny,
    roznica: round2(realnyKosztPrywatny - realnyKosztFirmowy)
  }
}

interface LeasingResult {
  rataMiesieczna: number
  rataNettoKoszt: number
  miesiecznaOszczednosc: number
  realnyKosztRaty: number
}

function calcLeasing(rataBrutto: number, vatRate: number, pitRate: number): LeasingResult {
  const vat = rataBrutto * (vatRate / (1 + vatRate))
  const netto = rataBrutto - vat
  const oszczednosc = netto * pitRate
  return {
    rataMiesieczna: rataBrutto,
    rataNettoKoszt: round2(netto),
    miesiecznaOszczednosc: round2(oszczednosc),
    realnyKosztRaty: round2(rataBrutto - vat - oszczednosc)
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export default function Kalkulator() {
  const { config } = useAppContext()
  const pitRate = config.tax.pitRate

  // Kalkulator jednorazowego zakupu
  const [kwota, setKwota] = useState('')
  const [vatRate, setVatRate] = useState('0.23')
  const [costResult, setCostResult] = useState<CostResult | null>(null)

  // Kalkulator leasingu
  const [leasingRata, setLeasingRata] = useState('')
  const [leasingVat, setLeasingVat] = useState('0.23')
  const [leasingResult, setLeasingResult] = useState<LeasingResult | null>(null)

  function calcCost() {
    const b = parseFloat(kwota.replace(',', '.'))
    if (!b || b <= 0) return
    setCostResult(calcCostBenefit(b, parseFloat(vatRate), pitRate))
  }

  function calcLeasingFn() {
    const r = parseFloat(leasingRata.replace(',', '.'))
    if (!r || r <= 0) return
    setLeasingResult(calcLeasing(r, parseFloat(leasingVat), pitRate))
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kalkulator kosztów firmowych</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Sprawdź, czy opłaca się wrzucić zakup w koszty · stawka PIT: {(pitRate * 100).toFixed(0)}%
        </p>
      </div>

      {/* Kalkulator zakupu */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Jednorazowy zakup</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Cena brutto zakupu (zł)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="np. 5000"
              value={kwota}
              onChange={(e) => setKwota(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && calcCost()}
              className="input"
            />
          </div>
          <div>
            <label className="label">Stawka VAT</label>
            <select value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="input">
              <option value="0.23">23% (standardowa)</option>
              <option value="0.08">8%</option>
              <option value="0.05">5%</option>
              <option value="0">0% (zwolniony)</option>
            </select>
          </div>
        </div>
        <button onClick={calcCost} className="btn-primary">Oblicz opłacalność</button>

        {costResult && (
          <div className="mt-5 space-y-4">
            <div className={`rounded-lg p-4 ${costResult.oplaca ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
              <p className={`font-semibold text-lg ${costResult.oplaca ? 'text-emerald-700' : 'text-amber-700'}`}>
                {costResult.oplaca
                  ? `✓ Opłaca się — oszczędzasz ${fmt(costResult.roznica)} zł`
                  : `✗ Nie opłaca się wrzucać w koszty`}
              </p>
              <p className="text-sm text-slate-600 mt-1">
                Jako koszt firmowy: <strong>{fmt(costResult.realnyKosztFirmowy)} zł</strong> ·
                Prywatnie: <strong>{fmt(costResult.realnyKosztPrywatny)} zł</strong>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Cena brutto" value={`${fmt(costResult.zakupBrutto)} zł`} />
              <InfoRow label="Odliczony VAT" value={`${fmt(costResult.vat)} zł`} />
              <InfoRow label="Koszt netto" value={`${fmt(costResult.nettoKoszt)} zł`} />
              <InfoRow label={`Oszczędność PIT (${(pitRate * 100).toFixed(0)}%)`} value={`${fmt(costResult.oszczednoscPodatkowa)} zł`} green />
              <InfoRow label="Realny koszt (firmowo)" value={`${fmt(costResult.realnyKosztFirmowy)} zł`} bold />
              <InfoRow label="Realny koszt (prywatnie)" value={`${fmt(costResult.realnyKosztPrywatny)} zł`} />
            </div>

            <p className="text-xs text-slate-400">
              Zakładamy, że jesteś czynnym podatnikiem VAT i odliczasz VAT od zakupów.
              Oszczędność PIT = netto × {(pitRate * 100).toFixed(0)}%.
            </p>
          </div>
        )}
      </div>

      {/* Kalkulator leasingu */}
      <div className="card p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Leasing — miesięczna rata</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Rata miesięczna brutto (zł)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="np. 2000"
              value={leasingRata}
              onChange={(e) => setLeasingRata(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && calcLeasingFn()}
              className="input"
            />
          </div>
          <div>
            <label className="label">VAT na racie</label>
            <select value={leasingVat} onChange={(e) => setLeasingVat(e.target.value)} className="input">
              <option value="0.23">23%</option>
              <option value="0.08">8%</option>
              <option value="0">0%</option>
            </select>
          </div>
        </div>
        <button onClick={calcLeasingFn} className="btn-primary">Oblicz ratę leasingu</button>

        {leasingResult && (
          <div className="mt-5 space-y-3">
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
              <p className="font-semibold text-sky-800">
                Realny koszt raty: <span className="text-lg">{fmt(leasingResult.realnyKosztRaty)} zł/mies.</span>
              </p>
              <p className="text-sm text-sky-600 mt-1">
                Miesięczna oszczędność podatkowa: {fmt(leasingResult.miesiecznaOszczednosc)} zł
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Rata brutto" value={`${fmt(leasingResult.rataMiesieczna)} zł`} />
              <InfoRow label="Rata netto (VAT odliczony)" value={`${fmt(leasingResult.rataNettoKoszt)} zł`} />
              <InfoRow label={`Oszczędność PIT (${(pitRate * 100).toFixed(0)}%)`} value={`${fmt(leasingResult.miesiecznaOszczednosc)} zł`} green />
              <InfoRow label="Realny koszt raty" value={`${fmt(leasingResult.realnyKosztRaty)} zł`} bold />
            </div>
          </div>
        )}
      </div>

      {/* Przypomnienie */}
      <div className="card p-4 bg-slate-50 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-600">Jak działają obliczenia?</p>
        <p>Podatek liniowy 19% — zakup firmowy zmniejsza podstawę opodatkowania o kwotę netto.</p>
        <p>Jeśli jesteś VAT-owcem, odliczasz też VAT naliczony od zakupów firmowych (zwykle 100%).</p>
        <p>Obliczenia są szacunkowe — konsultuj z księgowym przed dużymi decyzjami.</p>
      </div>
    </div>
  )
}

function InfoRow({ label, value, bold, green }: { label: string; value: string; bold?: boolean; green?: boolean }) {
  return (
    <>
      <span className="text-slate-500">{label}</span>
      <span className={`text-right tabular-nums ${bold ? 'font-semibold text-slate-800' : ''} ${green ? 'text-emerald-600 font-medium' : 'text-slate-700'}`}>
        {value}
      </span>
    </>
  )
}
