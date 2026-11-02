'use client'

import { useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { AlertCircle, Archive, CalendarDays, ChevronLeft, ChevronRight, CirclePlus, Clock3, LoaderCircle, PackagePlus, Search, X } from 'lucide-react'

type ApiData<T> = { success: boolean; message: string; data: T }
type InventoryRow = { id: string; batchId?: string; medicineId: string; medicineName?: string; sku?: string; batchNumber?: string; supplierName?: string; expiryDate?: string; quantityOnHand?: number; stockValuePaise?: number; status?: string; [key: string]: unknown }
type ListData = { items: InventoryRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number }; summary?: { batchCount: number; unitsOnHand: number; stockValuePaise: number; lowStockMedicineCount: number; nearExpiryBatchCount: number; expiredBatchCount: number } }
type SessionData = { user: { role: 'admin' | 'pharmacist' | 'cashier' } | null }
const tabs = [{ label: 'Current stock', resource: 'inventory', view: 'current' }, { label: 'Batch inventory', resource: 'batches', view: '' }, { label: 'Low stock', resource: 'inventory', view: 'low-stock' }, { label: 'Near expiry', resource: 'inventory', view: 'near-expiry' }, { label: 'Expired stock', resource: 'inventory', view: 'expired' }, { label: 'Stock movements', resource: 'stock-movements', view: '' }, { label: 'Adjustments', resource: 'stock-adjustments', view: '' }]
const panel = 'rounded-xl border border-[#e7ede9] bg-white shadow-[0_2px_7px_rgba(24,55,42,.025)]'
const buttonPrimary = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#157a62] px-3.5 text-xs font-semibold text-white transition hover:bg-[#116c56] disabled:cursor-not-allowed disabled:opacity-50'
const buttonSecondary = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#dfe8e3] bg-white px-3.5 text-xs font-semibold text-[#43524c] transition hover:bg-[#f8faf9] disabled:cursor-not-allowed disabled:opacity-50'
const inputClass = 'h-9 w-full rounded-lg border border-[#e0e8e4] bg-white px-3 text-xs text-[#26352f] outline-none focus:border-[#58a98c] focus:ring-2 focus:ring-[#e1f2eb]'

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json() as ApiData<T>
  if (!response.ok) throw new Error(result.message || 'Could not load inventory')
  return result.data
}
function money(paise: unknown) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(paise ?? 0) / 100)
}

export function InventoryApiPage() {
  const [tabIndex, setTabIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const pendingAdjustmentRef = useRef<{ signature: string; key: string } | null>(null)
  const activeTab = tabs[tabIndex]
  const querySuffix = `page=${page}&pageSize=10${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''}`
  const key = activeTab.resource === 'inventory'
    ? `/api/v1/inventory?view=${activeTab.view}&${querySuffix}`
    : `/api/v1/${activeTab.resource}?${querySuffix}`
  const { data, error, isLoading, mutate } = useSWR<ListData>(key, fetcher)
  const { data: overview } = useSWR<ListData>('/api/v1/inventory?view=current&page=1&pageSize=1', fetcher)
  const { data: batches } = useSWR<ListData>('/api/v1/batches?page=1&pageSize=100&sortBy=expiryDate&sortOrder=asc', fetcher)
  const { data: session } = useSWR<SessionData>('/api/auth/get-session', fetcher)
  const { mutate: mutateCache } = useSWRConfig()
  const canAdjust = session?.user?.role === 'admin' || session?.user?.role === 'pharmacist'
  const summary = overview?.summary

  async function submitAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setErrorMessage('')
    const form = new FormData(event.currentTarget)
    const quantityDelta = Number(form.get('quantityDelta'))
    const payload = { reason: String(form.get('reason') ?? '').trim(), adjustedOn: String(form.get('adjustedOn') ?? ''), lines: [{ batchId: String(form.get('batchId') ?? ''), quantityDelta }] }
    const signature = JSON.stringify(payload)
    if (pendingAdjustmentRef.current?.signature !== signature) {
      pendingAdjustmentRef.current = { signature, key: globalThis.crypto.randomUUID() }
    }
    try {
      const response = await fetch('/api/v1/stock-adjustments', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pendingAdjustmentRef.current.key }, body: JSON.stringify(payload) })
      const result = await response.json() as ApiData<unknown>
      if (!response.ok) throw new Error(result.message || 'Could not record adjustment')
      pendingAdjustmentRef.current = null
      setNotice('Stock adjustment recorded. Inventory and movement history are updated.')
      setModalOpen(false)
      await mutateCache((cacheKey) => typeof cacheKey === 'string' && cacheKey.startsWith('/api/v1/'), undefined, { revalidate: true })
      await mutate()
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : 'Could not record adjustment')
    } finally {
      setBusy(false)
    }
  }

  function selectTab(index: number) {
    setTabIndex(index); setPage(1); setQuery(''); setNotice(''); setErrorMessage('')
  }

  const columnKeys = activeTab.resource === 'stock-movements'
    ? [['movementType', 'Movement'], ['medicineId', 'Medicine ID'], ['batchId', 'Batch ID'], ['quantityDelta', 'Change'], ['occurredAt', 'Occurred']]
    : activeTab.resource === 'stock-adjustments'
      ? [['adjustmentNumber', 'Adjustment'], ['reason', 'Reason'], ['adjustedOn', 'Date'], ['createdByUserId', 'Created by'], ['status', 'Status']]
      : [['medicineName', 'Medicine'], ['batchNumber', 'Batch no.'], ['supplierName', 'Supplier'], ['expiryDate', 'Expiry date'], ['quantityOnHand', 'On hand'], ['stockValuePaise', 'Stock value'], ['status', 'Status']]
  const rows = data?.items ?? []
  const totalPages = data?.pagination.totalPages ?? 0

  return <div>
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#218066]">Stock control</p><h1 className="text-[23px] font-semibold tracking-[-.04em] text-[#1d2e28]">Inventory</h1><p className="mt-1 text-xs text-[#87938e]">Batch-level quantities are derived from the opening balance and immutable stock movements.</p></div>{canAdjust && <button onClick={() => { setErrorMessage(''); setModalOpen(true) }} className={buttonPrimary}><CirclePlus size={15} /> Stock adjustment</button>}</div>
    {notice && <div role="status" className="mb-4 rounded-lg border border-[#cfe9dc] bg-[#eff9f3] px-4 py-2.5 text-xs text-[#27775d]">{notice}</div>}
    {errorMessage && <div role="alert" className="mb-4 rounded-lg border border-[#f0d3cf] bg-[#fff5f3] px-4 py-2.5 text-xs text-[#ad514c]">{errorMessage}</div>}
    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Stock value" value={money(summary?.stockValuePaise)} icon={PackagePlus} />
      <Metric label="Units on hand" value={Number(summary?.unitsOnHand ?? 0).toLocaleString('en-IN')} icon={Archive} tone="blue" />
      <Metric label="Low-stock medicines" value={String(summary?.lowStockMedicineCount ?? 0)} icon={AlertCircle} tone="amber" />
      <Metric label="Near-expiry batches" value={String(summary?.nearExpiryBatchCount ?? 0)} icon={Clock3} tone="red" />
    </div>
    <section className={panel}>
      <div className="flex gap-1 overflow-x-auto border-b border-[#edf1ef] px-4 pt-3">{tabs.map((tab, index) => <button key={tab.label} onClick={() => selectTab(index)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[10px] font-semibold transition ${tabIndex === index ? 'border-[#20836a] text-[#17735d]' : 'border-transparent text-[#85918b] hover:text-[#45554d]'}`}>{tab.label}{tab.label === 'Low stock' && <span className="ml-1.5 rounded-full bg-[#fff1e7] px-1.5 py-0.5 text-[9px] text-[#ad6932]">{summary?.lowStockMedicineCount ?? 0}</span>}</button>)}</div>
      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center"><label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-[#e4ebe7] px-3"><Search size={14} className="text-[#95a19b]" /><span className="sr-only">Search inventory</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search medicine, batch, or supplier…" className="min-w-0 flex-1 text-xs outline-none" /></label><span className="inline-flex items-center gap-1.5 text-[10px] text-[#8d9993]"><CalendarDays size={13} /> Expiry-aware stock view</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="border-y border-[#edf1ef] bg-[#fafcfb]">{columnKeys.map(([key, label]) => <th key={key} className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-[.06em] text-[#84918b]">{label}</th>)}</tr></thead><tbody>
        {isLoading && <tr><td colSpan={columnKeys.length} className="py-12 text-center text-xs text-[#7f8d86]"><LoaderCircle size={16} className="mr-2 inline animate-spin" />Loading inventory…</td></tr>}
        {error && !isLoading && <tr><td colSpan={columnKeys.length} className="py-12 text-center text-xs text-[#ad514c]">{error.message}</td></tr>}
        {!isLoading && !error && rows.map((row) => <tr key={row.id} className="border-b border-[#f0f3f1] last:border-0 hover:bg-[#fcfdfc]">{columnKeys.map(([key]) => <td key={key} className="whitespace-nowrap px-4 py-3 text-[11px] text-[#68766f]">{key === 'stockValuePaise' ? money(row[key]) : key === 'status' ? <Status value={String(row[key] ?? 'Unknown')} /> : key === 'quantityDelta' ? `${Number(row[key]) > 0 ? '+' : ''}${String(row[key])}` : key === 'expiryDate' || key === 'adjustedOn' ? String(row[key] ?? '—') : key === 'medicineName' ? <span className="font-semibold text-[#35443e]">{String(row[key] ?? '—')}<span className="mt-0.5 block text-[9px] font-normal text-[#9aa49f]">{String(row.sku ?? '')}</span></span> : String(row[key] ?? '—')}</td>)}</tr>)}
        {!isLoading && !error && rows.length === 0 && <tr><td colSpan={columnKeys.length} className="py-14 text-center text-xs text-[#909b96]">No records match this inventory view.</td></tr>}
      </tbody></table></div>
      <div className="flex flex-col gap-2 border-t border-[#edf1ef] px-4 py-3 text-[10px] text-[#8d9993] sm:flex-row sm:items-center sm:justify-between"><span>{data ? `${data.pagination.total} records · page ${data.pagination.page} of ${Math.max(totalPages, 1)}` : ' '}</span><div className="flex items-center gap-1"><button className="rounded-md border border-[#e7ede9] p-1.5 disabled:opacity-40" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} aria-label="Previous page"><ChevronLeft size={13} /></button><button className="rounded-md border border-[#e7ede9] p-1.5 disabled:opacity-40" onClick={() => setPage((value) => Math.min(Math.max(totalPages, 1), value + 1))} disabled={!data || page >= Math.max(totalPages, 1)} aria-label="Next page"><ChevronRight size={13} /></button></div></div>
    </section>

    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setModalOpen(false) }}><section role="dialog" aria-modal="true" aria-labelledby="adjustment-title" className="w-full max-w-lg rounded-2xl border border-[#e6ece9] bg-white p-5 shadow-2xl"><div className="mb-4 flex items-start justify-between"><div><h2 id="adjustment-title" className="text-base font-semibold text-[#24352d]">Record stock adjustment</h2><p className="mt-1 text-[11px] text-[#929d98]">Stock cannot go below zero. Each change is recorded in the movement ledger.</p></div><button onClick={() => setModalOpen(false)} aria-label="Close dialog" className="rounded-lg p-1.5 text-[#7e8984] hover:bg-[#f2f6f4]"><X size={17} /></button></div><form className="flex flex-col gap-3" onSubmit={submitAdjustment}>
      <label className="flex flex-col gap-1.5 text-[10px] font-semibold text-[#5c6a63]">Batch<select name="batchId" className={inputClass} required defaultValue=""><option value="" disabled>Select a batch</option>{batches?.items.map((batch) => <option key={batch.id} value={batch.id}>{String(batch.batchNumber)} · {String(batch.id)} · {String(batch.expiryDate)}</option>)}</select></label>
      <label className="flex flex-col gap-1.5 text-[10px] font-semibold text-[#5c6a63]">Quantity change <span className="font-normal text-[#929d98]">Use a positive number to add stock, negative to remove it.</span><input name="quantityDelta" type="number" step="1" className={inputClass} required /></label>
      <label className="flex flex-col gap-1.5 text-[10px] font-semibold text-[#5c6a63]">Reason<input name="reason" className={inputClass} minLength={3} maxLength={250} required placeholder="Opening stock, damage, count correction…" /></label>
      <label className="flex flex-col gap-1.5 text-[10px] font-semibold text-[#5c6a63]">Adjustment date<input name="adjustedOn" type="date" className={inputClass} defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
      {errorMessage && <p role="alert" className="rounded-lg border border-[#f0d3cf] bg-[#fff5f3] px-3 py-2 text-xs text-[#ad514c]">{errorMessage}</p>}
      <div className="mt-1 flex justify-end gap-2 border-t border-[#edf1ef] pt-4"><button type="button" className={buttonSecondary} onClick={() => setModalOpen(false)} disabled={busy}>Cancel</button><button type="submit" className={buttonPrimary} disabled={busy || !batches?.items.length}>{busy && <LoaderCircle size={14} className="animate-spin" />}Save adjustment</button></div>
    </form></section></div>}
  </div>
}

function Metric({ label, value, icon: Icon, tone = 'green' }: { label: string; value: string; icon: React.ElementType; tone?: 'green' | 'blue' | 'amber' | 'red' }) {
  const color = tone === 'amber' ? 'bg-[#fff7e9] text-[#bd842b]' : tone === 'red' ? 'bg-[#fff0ed] text-[#bd5c51]' : tone === 'blue' ? 'bg-[#eff5ff] text-[#5579bd]' : 'bg-[#e9f5ef] text-[#218064]'
  return <div className={`${panel} p-4`}><div className="flex items-start justify-between"><div><p className="text-[11px] font-medium text-[#81908a]">{label}</p><p className="mt-2 text-[21px] font-semibold tracking-[-.04em] text-[#1e3029]">{value}</p></div><span className={`flex size-9 items-center justify-center rounded-xl ${color}`}><Icon size={17} /></span></div></div>
}
function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase()
  const color = normalized.includes('expired') || normalized.includes('out of') ? 'bg-[#fff0ed] text-[#b84d43]' : normalized.includes('low') || normalized.includes('near') ? 'bg-[#fff6e6] text-[#aa7524]' : 'bg-[#e9f6ef] text-[#287b5f]'
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold ${color}`}>{value}</span>
}
