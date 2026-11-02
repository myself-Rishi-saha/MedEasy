'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { BarChart3, ChevronLeft, ChevronRight, Download, Printer, Search } from 'lucide-react'

type ReportType = 'sales' | 'purchases' | 'profit' | 'expenses' | 'stock' | 'expiry' | 'payments' | 'tax'
type ReportRow = Record<string, string | number | null>
type ReportData = {
  type: ReportType
  from: string
  to: string
  items: ReportRow[]
  columns: string[]
  summary: Record<string, number | boolean | null>
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  methodology?: string
}
type RecordList = { items: Array<{ id: string; name: string }> }

const reports: Array<{ type: ReportType; title: string; subtitle: string }> = [
  { type: 'sales', title: 'Sales report', subtitle: 'Invoices and receipts' },
  { type: 'purchases', title: 'Purchase report', subtitle: 'Received stock and supplier dues' },
  { type: 'profit', title: 'Profit report', subtitle: 'Revenue, COGS, and expenses' },
  { type: 'expenses', title: 'Expense report', subtitle: 'Recorded operating expenses' },
  { type: 'stock', title: 'Stock report', subtitle: 'Current batches and valuation' },
  { type: 'expiry', title: 'Expiry report', subtitle: 'Batches within expiry date range' },
  { type: 'payments', title: 'Payment report', subtitle: 'Customer and supplier payments' },
  { type: 'tax', title: 'GST / tax report', subtitle: 'Taxable values and GST split' },
]
const moneyFields = new Set(['subtotalPaise', 'discountPaise', 'taxPaise', 'totalPaise', 'paidPaise', 'duePaise', 'salesRevenuePaise', 'costOfGoodsSoldPaise', 'grossProfitPaise', 'otherExpensesPaise', 'netProfitPaise', 'amountPaise', 'purchasePricePaise', 'stockValuePaise', 'receivedPaise', 'paidPaise', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise'])
const card = 'rounded-xl border border-[#e7ede9] bg-white shadow-[0_2px_7px_rgba(24,55,42,.025)]'
const input = 'h-9 w-full rounded-lg border border-[#e0e8e4] bg-white px-3 text-xs text-[#26352f] outline-none focus:border-[#58a98c] focus:ring-2 focus:ring-[#e1f2eb]'
const secondary = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#dfe8e3] bg-white px-3.5 text-xs font-semibold text-[#43524c] transition hover:bg-[#f8faf9] disabled:cursor-not-allowed disabled:opacity-50'

async function fetcher(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'Could not load report')
  return result.data
}

function formatMoney(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100)
}

function formatLabel(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatCell(key: string, value: ReportRow[string]) {
  if (value === null || value === undefined) return 'Unavailable'
  if (moneyFields.has(key) && typeof value === 'number') return formatMoney(value)
  if (key === 'rateBps' || key === 'taxRateBps') return `${(Number(value) / 100).toFixed(2)}%`
  if (key === 'date' || key === 'expiryDate') return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00.000Z`))
  if (typeof value === 'string' && value.includes('_')) return value.replaceAll('_', ' ')
  return String(value)
}

function summaryFields(type: ReportType, summary: ReportData['summary']) {
  const definitions: Record<ReportType, Array<[string, string]>> = {
    sales: [['count', 'Invoices'], ['totalPaise', 'Invoice total'], ['discountPaise', 'Discounts'], ['taxPaise', 'GST'], ['duePaise', 'Outstanding']],
    purchases: [['count', 'Received purchases'], ['totalPaise', 'Purchase total'], ['discountPaise', 'Discounts'], ['taxPaise', 'GST'], ['duePaise', 'Supplier due']],
    profit: [['salesRevenuePaise', 'Sales revenue (ex-GST)'], ['discountPaise', 'Discounts'], ['taxPaise', 'GST'], ['costOfGoodsSoldPaise', 'Cost of goods sold'], ['grossProfitPaise', 'Gross profit'], ['otherExpensesPaise', 'Other expenses'], ['netProfitPaise', 'Net profit']],
    expenses: [['count', 'Expenses'], ['amountPaise', 'Total recorded']],
    stock: [['unitsOnHand', 'Units on hand'], ['stockValuePaise', 'Stock value'], ['lowStockBatchCount', 'Low-stock batches'], ['nearExpiryBatchCount', 'Near-expiry batches'], ['expiredBatchCount', 'Expired batches']],
    expiry: [['count', 'Batches'], ['unitsOnHand', 'Units on hand'], ['stockValuePaise', 'Stock value'], ['expiredBatchCount', 'Expired batches']],
    payments: [['count', 'Payments'], ['receivedPaise', 'Money received'], ['paidPaise', 'Money paid'], ['totalPaise', 'Total movement']],
    tax: [['taxablePaise', 'Taxable value'], ['cgstPaise', 'CGST'], ['sgstPaise', 'SGST'], ['igstPaise', 'IGST'], ['taxPaise', 'Total GST']],
  }
  return definitions[type].map(([key, label]) => ({ key, label, value: summary[key] }))
}

function filterQuery(type: ReportType, values: Record<string, string>) {
  const query: Record<string, string> = {}
  if (type === 'sales') query.patientId = values.patientId ?? ''
  if (type === 'purchases') query.supplierId = values.supplierId ?? ''
  if (type === 'expenses') query.category = values.category ?? ''
  if (type === 'payments') { query.method = values.method ?? ''; query.direction = values.direction ?? '' }
  if (type === 'tax') { query.transactionType = values.transactionType ?? ''; query.rateBps = values.rateBps ?? '' }
  if (type === 'stock' || type === 'expiry') query.status = values.status ?? ''
  if (type === 'profit') query.patientId = values.patientId ?? ''
  return query
}

export function ReportsApiPage() {
  const [type, setType] = useState<ReportType>('sales')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [exportError, setExportError] = useState('')
  const query = useMemo(() => {
    const params = new URLSearchParams({ type, page: String(page), pageSize: '25', ...filterQuery(type, filters) })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (filters.q?.trim()) params.set('q', filters.q.trim())
    return params.toString()
  }, [type, page, from, to, filters])
  const reportKey = `/api/v1/reports?${query}`
  const { data, error, isLoading, mutate } = useSWR<ReportData>(reportKey, fetcher, { revalidateOnFocus: false })
  const { data: patients } = useSWR<RecordList>(type === 'sales' || type === 'profit' ? '/api/v1/patients?page=1&pageSize=100&sortBy=name&sortOrder=asc' : null, fetcher)
  const { data: suppliers } = useSWR<RecordList>(type === 'purchases' ? '/api/v1/suppliers?page=1&pageSize=100&sortBy=name&sortOrder=asc' : null, fetcher)

  function changeType(next: ReportType) {
    setType(next)
    setPage(1)
    setFilters({})
    setExportMessage('')
    setExportError('')
  }

  function changeFilter(key: string, value: string) {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  async function exportCsv() {
    setExporting(true)
    setExportMessage('')
    setExportError('')
    try {
      const url = `/api/v1/reports?${query}&format=csv`
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.message || 'Could not export CSV')
      }
      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = `med-easy-${type}-${data?.from ?? 'report'}-${data?.to ?? 'report'}.csv`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(downloadUrl)
      setExportMessage('CSV export downloaded.')
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Could not export CSV')
    } finally {
      setExporting(false)
    }
  }

  const selectedReport = reports.find((report) => report.type === type)!
  const summaries = data ? summaryFields(type, data.summary) : []

  return <main className="space-y-5">
    <style jsx global>{`@media print { body { background:#fff!important; } .report-print-card { border:0!important; box-shadow:none!important; } .report-no-print { display:none!important; } .report-print-title { display:block!important; } }`}</style>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-[23px] font-semibold tracking-[-.04em] text-[#1d2e28]">Reports</h1><p className="mt-1 text-xs text-[#87938e]">Live summaries calculated from saved sales, purchases, stock movements, payments, taxes, and expenses.</p></div><div className="report-no-print flex gap-2"><button className={secondary} onClick={() => window.print()}><Printer size={14} /> Print report</button><button className={secondary} disabled={exporting || isLoading} onClick={exportCsv}><Download size={14} />{exporting ? 'Preparing…' : 'Export CSV'}</button></div></div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{reports.map((report) => <button key={report.type} type="button" onClick={() => changeType(report.type)} aria-pressed={type === report.type} className={`rounded-xl border p-3 text-left transition ${type === report.type ? 'border-[#aed6c5] bg-[#f1f9f5]' : 'border-[#e7ede9] bg-white hover:bg-[#fafcfb]'}`}><span className={`mb-2 flex size-7 items-center justify-center rounded-lg ${type === report.type ? 'bg-[#deefe6] text-[#18745d]' : 'bg-[#f2f5f3] text-[#73817a]'}`}><BarChart3 size={15} /></span><span className="block text-[11px] font-semibold text-[#405149]">{report.title}</span><span className="mt-1 block text-[9px] text-[#96a19b]">{report.subtitle}</span></button>)}</div>

    <section className={`${card} report-print-card p-4 md:p-5`} aria-busy={isLoading}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-[14px] font-semibold text-[#26352f]">{selectedReport.title}</h2><p className="mt-1 text-[10px] text-[#95a09c]">{data ? `${data.from} – ${data.to} · ${data.pagination.total.toLocaleString('en-IN')} records` : 'Choose a date range and applicable filters'}</p></div><div className="grid grid-cols-2 gap-2 sm:flex"><label className="flex flex-col gap-1 text-[9px] font-semibold text-[#68766f]">From<input type="date" className={`${input} sm:w-[145px]`} value={from} onChange={(event) => { setFrom(event.target.value); setPage(1) }} /></label><label className="flex flex-col gap-1 text-[9px] font-semibold text-[#68766f]">To<input type="date" className={`${input} sm:w-[145px]`} value={to} onChange={(event) => { setTo(event.target.value); setPage(1) }} /></label></div></div>

      <div className="report-no-print mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"><label className="relative sm:col-span-2 lg:col-span-1"><span className="sr-only">Search report rows</span><Search size={14} className="absolute left-3 top-2.5 text-[#98a49e]" /><input className={`${input} pl-9`} placeholder="Search report rows" value={filters.q ?? ''} onChange={(event) => changeFilter('q', event.target.value)} /></label>
        {(type === 'sales' || type === 'profit') && <select aria-label="Filter by customer" className={input} value={filters.patientId ?? ''} onChange={(event) => changeFilter('patientId', event.target.value)}><option value="">All customers</option>{patients?.items.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select>}
        {type === 'purchases' && <select aria-label="Filter by supplier" className={input} value={filters.supplierId ?? ''} onChange={(event) => changeFilter('supplierId', event.target.value)}><option value="">All suppliers</option>{suppliers?.items.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>}
        {type === 'expenses' && <select aria-label="Filter by expense category" className={input} value={filters.category ?? ''} onChange={(event) => changeFilter('category', event.target.value)}><option value="">All categories</option>{['rent', 'utilities', 'supplies', 'salary', 'maintenance', 'transport', 'other'].map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}</select>}
        {type === 'payments' && <><select aria-label="Filter by payment method" className={input} value={filters.method ?? ''} onChange={(event) => changeFilter('method', event.target.value)}><option value="">All methods</option>{['cash', 'upi', 'card', 'bank_transfer', 'credit'].map((value) => <option key={value} value={value}>{formatLabel(value)}</option>)}</select><select aria-label="Filter payment direction" className={input} value={filters.direction ?? ''} onChange={(event) => changeFilter('direction', event.target.value)}><option value="">All directions</option><option value="received">Received</option><option value="paid">Paid</option></select></>}
        {type === 'tax' && <><select aria-label="Filter tax transactions" className={input} value={filters.transactionType ?? ''} onChange={(event) => changeFilter('transactionType', event.target.value)}><option value="">Sales and purchases</option><option value="sale">Sales</option><option value="purchase">Purchases</option></select><select aria-label="Filter GST rate" className={input} value={filters.rateBps ?? ''} onChange={(event) => changeFilter('rateBps', event.target.value)}><option value="">All GST rates</option>{[0, 500, 1200, 1800, 2800].map((rate) => <option key={rate} value={rate}>{(rate / 100).toFixed(2)}%</option>)}</select></>}
        {(type === 'stock' || type === 'expiry') && <select aria-label="Filter stock status" className={input} value={filters.status ?? ''} onChange={(event) => changeFilter('status', event.target.value)}><option value="">All stock statuses</option><option value="In stock">In stock</option><option value="Low stock">Low stock</option><option value="Near expiry">Near expiry</option><option value="Expired">Expired</option><option value="Out of stock">Out of stock</option></select>}
      </div>

      {error && <div role="alert" className="mb-4 rounded-lg border border-[#f0d3cf] bg-[#fff5f3] px-3 py-2 text-xs text-[#ad514c]">{error.message}<button className="ml-2 font-semibold underline" onClick={() => mutate()}>Retry</button></div>}
      {exportMessage && <p role="status" className="mb-3 text-xs text-[#238064]">{exportMessage}</p>}
      {exportError && <p role="alert" className="mb-3 text-xs text-[#ad514c]">{exportError}</p>}

      {isLoading && !data ? <div className="space-y-3" aria-label="Loading report"><div className="h-20 animate-pulse rounded-lg bg-[#eef2ef]"/><div className="h-56 animate-pulse rounded-lg bg-[#eef2ef]"/></div> : data && <>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">{summaries.map(({ key, label, value }) => <div key={key} className="rounded-lg border border-[#edf1ef] bg-[#fcfdfc] p-3"><p className="text-[9px] font-medium text-[#899690]">{label}</p><p className={`mt-1 text-[14px] font-semibold ${key === 'netProfitPaise' || key === 'grossProfitPaise' ? Number(value) < 0 ? 'text-[#b84d43]' : 'text-[#218064]' : 'text-[#28372f]'}`}>{value === null ? 'Unavailable' : typeof value === 'number' && moneyFields.has(key) ? formatMoney(value) : Number(value).toLocaleString('en-IN')}</p>{type === 'profit' && key === 'netProfitPaise' && data.summary.cogsKnown === false && <p className="mt-1 text-[9px] text-[#ad514c]">Missing batch cost; profit is not calculated.</p>}</div>)}</div>
        {data.methodology && <details className="mb-4 rounded-lg border border-[#e7ede9] bg-[#f9fbfa] p-3"><summary className="cursor-pointer text-[10px] font-semibold text-[#43554c]">Profit calculation methodology</summary><p className="mt-2 text-[10px] leading-5 text-[#75827c]">{data.methodology}</p></details>}
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="border-y border-[#edf1ef] bg-[#fafcfb]">{data.columns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-3 text-[9px] font-semibold uppercase tracking-[.05em] text-[#84918b]">{formatLabel(column)}</th>)}</tr></thead><tbody>{data.items.length ? data.items.map((row, index) => <tr key={String(row.invoiceNumber ?? row.batchNumber ?? row.reference ?? `${page}-${index}`) + index} className="border-b border-[#f0f3f1] last:border-0">{data.columns.map((column) => <td key={column} className="whitespace-nowrap px-3 py-3 text-[10px] text-[#53625b]">{formatCell(column, row[column])}</td>)}</tr>) : <tr><td colSpan={data.columns.length} className="px-4 py-10 text-center text-xs text-[#929d98]">No records match this date range and filter combination.</td></tr>}</tbody></table></div>
        <div className="report-no-print mt-4 flex flex-col gap-3 border-t border-[#edf1ef] pt-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] text-[#87938e]">Showing {data.pagination.total ? (data.pagination.page - 1) * data.pagination.pageSize + 1 : 0}–{Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)} of {data.pagination.total.toLocaleString('en-IN')}</p><div className="flex gap-2"><button className={secondary} disabled={page <= 1 || isLoading} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={14} /> Previous</button><button className={secondary} disabled={page >= data.pagination.totalPages || isLoading} onClick={() => setPage((current) => current + 1)}>Next <ChevronRight size={14} /></button></div></div>
      </>}
    </section>
  </main>
}
