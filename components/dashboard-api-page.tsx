'use client'

import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Clock3, PackagePlus, Pill, Plus, ShoppingBag, ShoppingCart, TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type DashboardRange = 'week' | 'month' | 'year'
type DashboardData = {
  date: string
  timezone: string
  range: DashboardRange
  pharmacyName: string
  stats: {
    salesTodayPaise: number
    purchasesTodayPaise: number
    medicineCount: number
    stockValuePaise: number
    lowStockMedicineCount: number
    nearExpiryBatchCount: number
    expiredBatchCount: number
    customerBalancePaise: number
    customerBalanceCount: number
    supplierBalancePaise: number
    supplierBalanceCount: number
    cashMovementPaise: number
    lowStockAlertsEnabled: boolean
    nearExpiryAlertsEnabled: boolean
    nearExpiryDays: number
  }
  series: Array<{ label: string; date: string; salesPaise: number; purchasesPaise: number }>
  recentSales: Array<{ id: string; invoiceNumber: string; soldOn: string; customer: string; totalPaise: number; status: string }>
  recentPurchases: Array<{ id: string; invoiceNumber: string; purchasedOn: string; supplier: string; totalPaise: number; status: string }>
  lowStockItems: Array<{ medicineId: string; medicineName: string; sku: string; quantityOnHand: number; reorderLevel: number }>
  nearExpiryItems: Array<{ medicineId: string; medicineName: string; batchNumber: string; expiryDate: string; quantityOnHand: number }>
  expiredItems: Array<{ medicineId: string; medicineName: string; batchNumber: string; expiryDate: string; quantityOnHand: number }>
}
type UserPreferences = { dashboardRange: DashboardRange }

const panel = 'rounded-xl border border-[#e7ede9] bg-white shadow-[0_2px_7px_rgba(24,55,42,.025)]'
const primary = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#157a62] px-3.5 text-xs font-semibold text-white transition hover:bg-[#116c56] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4bab8a]'
const secondary = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#dfe8e3] bg-white px-3.5 text-xs font-semibold text-[#43524c] transition hover:bg-[#f8faf9]'

async function fetcher(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'Could not load dashboard data')
  return result.data
}

function money(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100)
}

function dateLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: timezone }).format(new Date(`${value}T12:00:00.000Z`))
}

function Status({ value }: { value: string }) {
  const color = value === 'partially_paid' ? 'bg-[#fff5e7] text-[#a06d1d]' : 'bg-[#e9f6ef] text-[#287b5f]'
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${color}`}>{value.replaceAll('_', ' ')}</span>
}

function Metric({ label, value, icon: Icon, tone = 'green', hint }: { label: string; value: string; icon: React.ElementType; tone?: 'green' | 'blue' | 'amber' | 'red'; hint?: string }) {
  const toneClass = tone === 'amber' ? 'bg-[#fff7e9] text-[#bd842b]' : tone === 'red' ? 'bg-[#fff0ed] text-[#bd5c51]' : tone === 'blue' ? 'bg-[#eff5ff] text-[#5579bd]' : 'bg-[#e9f5ef] text-[#218064]'
  return <section className={`${panel} p-4 md:p-5`}><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-medium text-[#81908a]">{label}</p><p className="mt-2 text-[21px] font-semibold tracking-[-.04em] text-[#1e3029]">{value}</p></div><span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${toneClass}`}><Icon size={17} /></span></div>{hint && <p className="mt-3 text-[10px] text-[#96a19c]">{hint}</p>}</section>
}

function LoadingDashboard() {
  return <div className="space-y-5" aria-label="Loading dashboard" aria-busy="true"><div className="h-14 animate-pulse rounded-xl bg-[#e9efeb]" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl bg-[#e9efeb]" />)}</div><div className="h-72 animate-pulse rounded-xl bg-[#e9efeb]" /></div>
}

export function DashboardApiPage() {
  const { data: preferences } = useSWR<UserPreferences>('/api/v1/preferences', fetcher)
  const [selectedRange, setSelectedRange] = useState<DashboardRange | null>(null)
  const range = selectedRange ?? preferences?.dashboardRange ?? 'week'
  const { data, error, isLoading } = useSWR<DashboardData>(`/api/v1/dashboard?range=${range}`, fetcher, { refreshInterval: 60_000, revalidateOnFocus: true })

  if (isLoading && !data) return <LoadingDashboard />
  if (error && !data) return <div className={`${panel} p-6`} role="alert"><h1 className="text-base font-semibold text-[#743d37]">Dashboard unavailable</h1><p className="mt-2 text-xs text-[#7e8984]">{error.message}</p><button className={`${secondary} mt-4`} onClick={() => window.location.reload()}>Retry</button></div>
  if (!data) return null

  const chartData = data.series.map((point) => ({ label: point.label, sales: point.salesPaise / 100, purchases: point.purchasesPaise / 100 }))
  const date = dateLabel(data.date, data.timezone)
  const stats = data.stats

  return <main className="space-y-5">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#218066]">{data.pharmacyName}</p><h1 className="text-[23px] font-semibold tracking-[-.04em] text-[#1d2e28]">Dashboard</h1><p className="mt-1 text-xs text-[#87938e]">Live business activity for {date}.</p></div>
      <div className="flex gap-2"><Link href="/sales/new" className={primary}><Plus size={15} /> New sale</Link><Link href="/purchases/new" className={secondary}><PackagePlus size={15} /> New purchase</Link></div>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Sales today" value={money(stats.salesTodayPaise)} icon={ShoppingCart} hint="Completed and partially paid invoices" />
      <Metric label="Purchases today" value={money(stats.purchasesTodayPaise)} icon={ShoppingBag} tone="blue" hint="Received purchases" />
      <Metric label="Active medicines" value={stats.medicineCount.toLocaleString('en-IN')} icon={Pill} hint="Medicine catalog" />
      <Metric label="Current stock value" value={money(stats.stockValuePaise)} icon={TrendingUp} hint="On-hand stock at batch purchase cost" />
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Low-stock medicines" value={String(stats.lowStockMedicineCount)} icon={AlertCircle} tone="amber" hint={stats.lowStockAlertsEnabled ? 'At or below reorder level' : 'Low-stock alerts are disabled'} />
      <Metric label="Near expiry" value={String(stats.nearExpiryBatchCount)} icon={Clock3} tone="amber" hint={stats.nearExpiryAlertsEnabled ? `Batches within ${stats.nearExpiryDays} days` : 'Near-expiry alerts are disabled'} />
      <Metric label="Expired batches" value={String(stats.expiredBatchCount)} icon={AlertCircle} tone="red" hint="Positive stock past expiry date" />
      <Metric label="Customer balances" value={money(stats.customerBalancePaise)} icon={ArrowDownRight} tone="blue" hint={`${stats.customerBalanceCount} customer accounts with due balances`} />
      <Metric label="Supplier balances" value={money(stats.supplierBalancePaise)} icon={ArrowUpRight} tone="blue" hint={`${stats.supplierBalanceCount} suppliers with due balances`} />
      <Metric label="Net cash movement today" value={money(stats.cashMovementPaise)} icon={TrendingUp} hint="Cash-book inflows less outflows" />
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.65fr_1fr]">
      <section className={`${panel} p-4 md:p-5`}><div className="mb-3 flex items-start justify-between gap-3"><div><h2 className="text-[13px] font-semibold text-[#26352f]">Sales and purchases</h2><p className="mt-0.5 text-[10px] text-[#95a09c]">Recorded transaction totals for the selected period</p></div><select aria-label="Chart date range" className="h-8 rounded-lg border border-[#e6ece8] bg-white px-2 text-[10px] text-[#66746e]" value={range} onChange={(event) => setSelectedRange(event.target.value as DashboardRange)}><option value="week">This week</option><option value="month">This month</option><option value="year">This year</option></select></div><div className="mb-3 flex gap-4 text-[10px] text-[#77847e]"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#21856a]" />Sales</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#a7d9c4]" />Purchases</span></div><div className="h-[220px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}><defs><linearGradient id="dashboardSalesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2b9275" stopOpacity={0.16} /><stop offset="100%" stopColor="#2b9275" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#edf2ef" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9aa59f', fontSize: 10 }} dy={9} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9aa59f', fontSize: 10 }} tickFormatter={(value) => `${value >= 1000 ? `${Math.round(value / 1000)}k` : Math.round(value)}`} /><Tooltip formatter={(value) => money(Number(value) * 100)} contentStyle={{ border: '1px solid #e6ede9', borderRadius: 10, fontSize: 11 }} /><Area type="monotone" dataKey="sales" name="Sales" stroke="#21856a" strokeWidth={2.5} fill="url(#dashboardSalesFill)" /><Area type="monotone" dataKey="purchases" name="Purchases" stroke="#a7d9c4" strokeWidth={2} fill="transparent" /></AreaChart></ResponsiveContainer></div>{error && <p className="mt-2 text-[10px] text-[#ad514c]" role="status">The latest refresh failed; showing the last loaded dashboard.</p>}</section>
      <section className={`${panel} p-4 md:p-5`}><div><h2 className="text-[13px] font-semibold text-[#26352f]">Quick actions</h2><p className="mt-0.5 text-[10px] text-[#95a09c]">Common tasks</p></div><div className="mt-4 grid grid-cols-2 gap-2.5">{[
        ['New sale', '/sales/new', ShoppingCart], ['Add medicine', '/medicines', Plus], ['New purchase', '/purchases/new', ShoppingBag], ['Create quotation', '/quotations/new', ArrowRight],
      ].map(([label, href, Icon]) => { const ActionIcon = Icon as React.ElementType; return <Link key={label as string} href={href as string} className="group flex min-h-[77px] flex-col justify-between rounded-xl border border-[#e8eeeb] bg-[#fcfdfc] p-3 transition hover:border-[#b8d9cc] hover:bg-[#f4faf7]"><span className="flex size-7 items-center justify-center rounded-lg bg-[#e9f5ef] text-[#238068] group-hover:bg-white"><ActionIcon size={15} /></span><span className="text-[11px] font-semibold text-[#46554f]">{label as string}<ArrowRight size={12} className="ml-1 inline text-[#a1aca7]" /></span></Link> })}</div></section>
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <section className={panel}><div className="flex items-center justify-between p-4"><div><h2 className="text-[13px] font-semibold text-[#26352f]">Recent sales</h2><p className="mt-0.5 text-[10px] text-[#95a09c]">Latest completed invoices</p></div><Link href="/sales" className="text-[10px] font-semibold text-[#18765e] hover:underline">View all</Link></div><div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left"><thead><tr className="border-y border-[#edf1ef] bg-[#fafcfb]">{['Invoice', 'Customer', 'Date', 'Amount', 'Status'].map((label) => <th key={label} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[.06em] text-[#84918b]">{label}</th>)}</tr></thead><tbody>{data.recentSales.length ? data.recentSales.map((sale) => <tr key={sale.id} className="border-b border-[#f0f3f1] last:border-0"><td className="px-4 py-3 text-[11px] font-semibold text-[#34443d]"><Link href={`/sales/${sale.id}`} className="hover:underline">{sale.invoiceNumber}</Link></td><td className="px-4 py-3 text-[11px] text-[#68766f]">{sale.customer}</td><td className="px-4 py-3 text-[11px] text-[#68766f]">{dateLabel(sale.soldOn, data.timezone)}</td><td className="px-4 py-3 text-[11px] font-semibold text-[#34443d]">{money(sale.totalPaise)}</td><td className="px-4 py-3"><Status value={sale.status} /></td></tr>) : <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-[#929d98]">No completed sales yet.</td></tr>}</tbody></table></div></section>
      <section className={panel}><div className="flex items-center justify-between p-4"><div><h2 className="text-[13px] font-semibold text-[#26352f]">Recent purchases</h2><p className="mt-0.5 text-[10px] text-[#95a09c]">Latest stock receipts</p></div><Link href="/purchases" className="text-[10px] font-semibold text-[#18765e] hover:underline">View all</Link></div><div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left"><thead><tr className="border-y border-[#edf1ef] bg-[#fafcfb]">{['Invoice', 'Supplier', 'Date', 'Amount', 'Status'].map((label) => <th key={label} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[.06em] text-[#84918b]">{label}</th>)}</tr></thead><tbody>{data.recentPurchases.length ? data.recentPurchases.map((purchase) => <tr key={purchase.id} className="border-b border-[#f0f3f1] last:border-0"><td className="px-4 py-3 text-[11px] font-semibold text-[#34443d]"><Link href={`/purchases/${purchase.id}`} className="hover:underline">{purchase.invoiceNumber}</Link></td><td className="px-4 py-3 text-[11px] text-[#68766f]">{purchase.supplier}</td><td className="px-4 py-3 text-[11px] text-[#68766f]">{dateLabel(purchase.purchasedOn, data.timezone)}</td><td className="px-4 py-3 text-[11px] font-semibold text-[#34443d]">{money(purchase.totalPaise)}</td><td className="px-4 py-3"><Status value={purchase.status} /></td></tr>) : <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-[#929d98]">No received purchases yet.</td></tr>}</tbody></table></div></section>
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <section className={`${panel} p-4`}><div className="mb-3 flex items-center justify-between"><div><h2 className="text-[13px] font-semibold text-[#26352f]">Low stock</h2><p className="mt-0.5 text-[10px] text-[#95a09c]">Medicines at or below reorder level</p></div><Link href="/inventory?view=low-stock" className="text-[10px] font-semibold text-[#18765e]">Review</Link></div>{data.lowStockItems.length ? data.lowStockItems.slice(0, 4).map((item) => <div key={item.medicineId} className="flex items-center justify-between gap-3 border-t border-[#f0f3f1] py-3"><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#35443e]">{item.medicineName}</p><p className="text-[10px] text-[#919d97]">{item.sku} · reorder at {item.reorderLevel}</p></div><span className="shrink-0 text-[11px] font-semibold text-[#b56e2b]">{item.quantityOnHand} left</span></div>) : <p className="border-t border-[#f0f3f1] py-4 text-xs text-[#929d98]">{stats.lowStockAlertsEnabled ? 'No medicines are below their reorder level.' : 'Low-stock notifications are disabled.'}</p>}</section>
      <section className={`${panel} p-4`}><div className="mb-3"><h2 className="text-[13px] font-semibold text-[#26352f]">Near expiry</h2><p className="mt-0.5 text-[10px] text-[#95a09c]">Batches within {stats.nearExpiryDays} days</p></div>{data.nearExpiryItems.length ? data.nearExpiryItems.slice(0, 4).map((item) => <div key={`${item.medicineId}-${item.batchNumber}`} className="flex items-center justify-between gap-3 border-t border-[#f0f3f1] py-3"><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#35443e]">{item.medicineName}</p><p className="text-[10px] text-[#919d97]">Batch {item.batchNumber} · expires {dateLabel(item.expiryDate, data.timezone)}</p></div><span className="shrink-0 text-[11px] font-semibold text-[#a46d1f]">{item.quantityOnHand}</span></div>) : <p className="border-t border-[#f0f3f1] py-4 text-xs text-[#929d98]">{stats.nearExpiryAlertsEnabled ? 'No batches are nearing expiry.' : 'Near-expiry notifications are disabled.'}</p>}</section>
      <section className={`${panel} p-4`}><div className="mb-3"><h2 className="text-[13px] font-semibold text-[#26352f]">Expired stock</h2><p className="mt-0.5 text-[10px] text-[#95a09c]">Do not dispense expired batches</p></div>{data.expiredItems.length ? data.expiredItems.slice(0, 4).map((item) => <div key={`${item.medicineId}-${item.batchNumber}`} className="flex items-center justify-between gap-3 border-t border-[#f0f3f1] py-3"><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#35443e]">{item.medicineName}</p><p className="text-[10px] text-[#919d97]">Batch {item.batchNumber} · expired {dateLabel(item.expiryDate, data.timezone)}</p></div><span className="shrink-0 text-[11px] font-semibold text-[#b84d43]">{item.quantityOnHand}</span></div>) : <p className="border-t border-[#f0f3f1] py-4 text-xs text-[#929d98]">No expired stock on hand.</p>}</section>
    </div>
    <p className="text-[10px] text-[#98a39e]">Dashboard totals are calculated from saved transactions and stock movements. Local JSON storage is intended for a single-instance demo, not reliable multi-user production use.</p>
  </main>
}
