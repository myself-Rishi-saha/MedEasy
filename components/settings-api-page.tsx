'use client'

import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Plus, Save, Trash2 } from 'lucide-react'

type SettingsSection = 'pharmacy' | 'tax' | 'invoice' | 'inventory'
type SettingsRecord = Record<string, unknown>
type WorkspaceSettings = { pharmacy: SettingsRecord; tax: SettingsRecord; invoice: SettingsRecord; inventory: SettingsRecord }
type UserPreferences = { timezone: string; dateFormat: string; dashboardRange: 'week' | 'month' | 'year'; updatedAt: string }

const tabs: Array<{ key: SettingsSection | 'preferences'; title: string }> = [
  { key: 'pharmacy', title: 'Pharmacy profile' },
  { key: 'tax', title: 'Tax settings' },
  { key: 'invoice', title: 'Invoice settings' },
  { key: 'inventory', title: 'Inventory' },
  { key: 'preferences', title: 'User preferences' },
]
const input = 'h-9 w-full rounded-lg border border-[#e0e8e4] bg-white px-3 text-xs text-[#26352f] outline-none transition placeholder:text-[#a2ada8] focus:border-[#58a98c] focus:ring-2 focus:ring-[#e1f2eb]'
const primary = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#157a62] px-3.5 text-xs font-semibold text-white transition hover:bg-[#116c56] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4bab8a] disabled:cursor-not-allowed disabled:opacity-50'
const secondary = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#dfe8e3] bg-white px-3.5 text-xs font-semibold text-[#43524c] transition hover:bg-[#f8faf9] disabled:cursor-not-allowed disabled:opacity-50'

async function fetcher(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'Could not load settings')
  return result.data
}

function PageHeading() {
  return <div className="mb-6"><h1 className="text-[23px] font-semibold tracking-[-.04em] text-[#1d2e28]">Settings</h1><p className="mt-1 text-xs text-[#87938e]">Persisted pharmacy configuration, tax rules, invoice numbering, inventory alerts, and personal display preferences.</p></div>
}

function Field({ label, value, onChange, type = 'text', readOnly = false, min, max, step, inputMode }: { label: string; value: unknown; onChange?: (value: string) => void; type?: string; readOnly?: boolean; min?: number; max?: number; step?: number; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'] }) {
  return <label className="flex flex-col gap-1.5 text-[10px] font-semibold text-[#5c6a63]">{label}<input className={input} type={type} value={type === 'checkbox' ? undefined : String(value ?? '')} checked={type === 'checkbox' ? Boolean(value) : undefined} onChange={(event) => onChange?.(type === 'checkbox' ? String(event.target.checked) : event.target.value)} readOnly={readOnly} min={min} max={max} step={step} /></label>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-[#e7ede9] px-3 text-[10px] font-medium text-[#53625b]">{label}<input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[#157a62]" /></label>
}

function SettingsEditor({ section, initial }: { section: SettingsSection; initial: SettingsRecord }) {
  const [values, setValues] = useState<SettingsRecord>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const { mutate } = useSWRConfig()

  function update(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }))
    setSaved('')
    setError('')
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSaved('')
    try {
      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...payload } = values
      const response = await fetch(`/api/v1/settings/${section}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Could not save settings')
      await mutate('/api/v1/settings')
      await mutate((key) => typeof key === 'string' && key.startsWith('/api/v1/'), undefined, { revalidate: true })
      setValues(result.data as SettingsRecord)
      setSaved('Settings saved successfully.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save settings')
    } finally {
      setBusy(false)
    }
  }

  const value = (key: string) => values[key]
  const setString = (key: string) => (next: string) => update(key, next)
  const setNumber = (key: string) => (next: string) => update(key, next === '' ? '' : Number(next))

  return <form onSubmit={submit} className="max-w-3xl space-y-5">
    {section === 'pharmacy' && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Pharmacy name" value={value('name')} onChange={setString('name')} />
      <Field label="Legal name" value={value('legalName')} onChange={setString('legalName')} />
      <Field label="Phone" value={value('phone')} onChange={setString('phone')} />
      <Field label="Email" value={value('email')} onChange={setString('email')} type="email" />
      <Field label="GSTIN" value={value('gstin')} onChange={setString('gstin')} />
      <Field label="State" value={value('state')} onChange={setString('state')} />
      <Field label="City" value={value('city')} onChange={setString('city')} />
      <Field label="PIN code" value={value('pincode')} onChange={setString('pincode')} inputMode="numeric" />
      <Field label="Address" value={value('address')} onChange={setString('address')} />
      <Field label="Opening stock as of" value={value('openingStockAsOf')} onChange={setString('openingStockAsOf')} type="date" />
      <Field label="Currency" value="INR — Indian rupee" readOnly />
    </div>}

    {section === 'tax' && <div className="space-y-4">
      <div className="rounded-lg border border-[#f1dfba] bg-[#fff9ed] p-3 text-[10px] leading-5 text-[#8d672b]">Tax settings are applied to new transactions. Existing invoices retain their stored totals. Confirm tax rates and rules with a qualified tax professional before use.</div>
      <Toggle label="Prices include GST" checked={Boolean(value('taxInclusivePricing'))} onChange={(checked) => update('taxInclusivePricing', checked)} />
      <div className="space-y-2">{(Array.isArray(value('rates')) ? value('rates') as Array<{ name: string; rateBps: number; enabled: boolean }> : []).map((rate, index) => <div key={`${index}-${rate.rateBps}`} className="grid grid-cols-[1fr_120px_90px_34px] items-end gap-2 rounded-lg border border-[#edf1ef] p-3"><Field label="Rate label" value={rate.name} onChange={(next) => update('rates', (value('rates') as typeof rate[]).map((item, itemIndex) => itemIndex === index ? { ...item, name: next } : item))} /><Field label="Rate (basis points)" type="number" min={0} max={10000} step={1} value={rate.rateBps} onChange={(next) => update('rates', (value('rates') as typeof rate[]).map((item, itemIndex) => itemIndex === index ? { ...item, rateBps: Number(next) } : item))} /><Toggle label="Enabled" checked={rate.enabled} onChange={(checked) => update('rates', (value('rates') as typeof rate[]).map((item, itemIndex) => itemIndex === index ? { ...item, enabled: checked } : item))} /><button type="button" aria-label={`Remove ${rate.name}`} className="mb-0.5 flex size-8 items-center justify-center rounded-lg border border-[#f0d3cf] text-[#ad514c] hover:bg-[#fff5f3]" onClick={() => update('rates', (value('rates') as typeof rate[]).filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button></div>)}<button type="button" className={secondary} onClick={() => update('rates', [...(value('rates') as Array<{ name: string; rateBps: number; enabled: boolean }>), { name: '', rateBps: 0, enabled: true }])}><Plus size={14} /> Add GST rate</button></div>
    </div>}

    {section === 'invoice' && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Sales invoice prefix" value={value('salePrefix')} onChange={setString('salePrefix')} />
      <Field label="Next sales invoice number" value={value('nextSaleNumber')} onChange={setNumber('nextSaleNumber')} type="number" min={1} step={1} />
      <Field label="Purchase prefix" value={value('purchasePrefix')} onChange={setString('purchasePrefix')} />
      <Field label="Next purchase number" value={value('nextPurchaseNumber')} onChange={setNumber('nextPurchaseNumber')} type="number" min={1} step={1} />
      <Field label="Quotation prefix" value={value('quotationPrefix')} onChange={setString('quotationPrefix')} />
      <Field label="Next quotation number" value={value('nextQuotationNumber')} onChange={setNumber('nextQuotationNumber')} type="number" min={1} step={1} />
      <div className="sm:col-span-2"><Toggle label="Show GST breakdown on invoices" checked={Boolean(value('showGstBreakdown'))} onChange={(checked) => update('showGstBreakdown', checked)} /></div>
      <label className="flex flex-col gap-1.5 text-[10px] font-semibold text-[#5c6a63] sm:col-span-2">Invoice footer<textarea className={`${input} min-h-20 resize-y py-2`} maxLength={500} value={String(value('footer') ?? '')} onChange={(event) => update('footer', event.target.value)} /></label>
    </div>}

    {section === 'inventory' && <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Toggle label="Enable low-stock alerts" checked={Boolean(value('lowStockAlertsEnabled'))} onChange={(checked) => update('lowStockAlertsEnabled', checked)} /></div>
      <div className="sm:col-span-2"><Toggle label="Enable near-expiry alerts" checked={Boolean(value('nearExpiryAlertsEnabled'))} onChange={(checked) => update('nearExpiryAlertsEnabled', checked)} /></div>
      <Field label="Near-expiry window (days)" value={value('nearExpiryDays')} onChange={setNumber('nearExpiryDays')} type="number" min={1} max={365} step={1} />
      <p className="self-end pb-2 text-[10px] leading-4 text-[#88958e]">Reorder levels are maintained on each medicine. Changing the expiry window updates the inventory and dashboard classifications.</p>
    </div>}

    {error && <p role="alert" className="rounded-lg border border-[#f0d3cf] bg-[#fff5f3] px-3 py-2 text-xs text-[#ad514c]">{error}</p>}
    {saved && <p role="status" className="rounded-lg border border-[#dcefe5] bg-[#f2faf5] px-3 py-2 text-xs text-[#23785d]">{saved}</p>}
    <div className="flex justify-end border-t border-[#edf1ef] pt-4"><button className={primary} type="submit" disabled={busy}><Save size={14} />{busy ? 'Saving…' : 'Save settings'}</button></div>
  </form>
}

function PreferencesPanel() {
  const { data, error, isLoading, mutate } = useSWR<UserPreferences>('/api/v1/preferences', fetcher)
  const { mutate: mutateAll } = useSWRConfig()
  const [values, setValues] = useState<UserPreferences | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const current = values ?? data

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!current) return
    setBusy(true)
    setMessage('')
    setSaveError('')
    try {
      const response = await fetch('/api/v1/preferences', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timezone: current.timezone, dateFormat: current.dateFormat, dashboardRange: current.dashboardRange }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Could not save preferences')
      setValues(result.data)
      await mutate(result.data)
      await mutateAll((key) => typeof key === 'string' && key.startsWith('/api/v1/dashboard'), undefined, { revalidate: true })
      setMessage('Preferences saved successfully.')
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Could not save preferences')
    } finally {
      setBusy(false)
    }
  }

  if (isLoading && !data) return <div className="h-40 animate-pulse rounded-xl bg-[#eef2ef]" aria-label="Loading preferences" />
  if (error && !data) return <p role="alert" className="text-xs text-[#ad514c]">{error.message}</p>
  if (!current) return null

  function change(key: 'timezone' | 'dateFormat' | 'dashboardRange', value: string) {
    setValues((previous) => ({ ...(previous ?? data!), [key]: value } as UserPreferences))
    setMessage('')
    setSaveError('')
  }

  return <form onSubmit={submit} className="max-w-xl space-y-4">
    <label className="flex flex-col gap-1.5 text-[10px] font-semibold text-[#5c6a63]">Timezone<input className={input} value={current.timezone} onChange={(event) => change('timezone', event.target.value)} placeholder="Asia/Kolkata" list="common-timezones" required /><datalist id="common-timezones"><option value="Asia/Kolkata"/><option value="UTC"/><option value="Asia/Dubai"/><option value="Europe/London"/><option value="America/New_York"/></datalist><span className="font-normal text-[#909b96]">Use a valid IANA timezone name.</span></label>
    <label className="flex flex-col gap-1.5 text-[10px] font-semibold text-[#5c6a63]">Date format<select className={input} value={current.dateFormat} onChange={(event) => change('dateFormat', event.target.value)}><option>DD MMM YYYY</option><option>DD/MM/YYYY</option><option>YYYY-MM-DD</option></select></label>
    <label className="flex flex-col gap-1.5 text-[10px] font-semibold text-[#5c6a63]">Default dashboard range<select className={input} value={current.dashboardRange} onChange={(event) => change('dashboardRange', event.target.value)}><option value="week">This week</option><option value="month">This month</option><option value="year">This year</option></select></label>
    {saveError && <p role="alert" className="rounded-lg border border-[#f0d3cf] bg-[#fff5f3] px-3 py-2 text-xs text-[#ad514c]">{saveError}</p>}
    {message && <p role="status" className="rounded-lg border border-[#dcefe5] bg-[#f2faf5] px-3 py-2 text-xs text-[#23785d]">{message}</p>}
    <div className="flex justify-end border-t border-[#edf1ef] pt-4"><button className={primary} type="submit" disabled={busy}><Save size={14} />{busy ? 'Saving…' : 'Save preferences'}</button></div>
  </form>
}

export function SettingsApiPage() {
  const [tab, setTab] = useState<SettingsSection | 'preferences'>('pharmacy')
  const { data, error, isLoading, mutate } = useSWR<WorkspaceSettings>('/api/v1/settings', fetcher)
  const selected = tabs.find((item) => item.key === tab)!

  return <main>
    <PageHeading />
    <section className="overflow-hidden rounded-xl border border-[#e7ede9] bg-white shadow-[0_2px_7px_rgba(24,55,42,.025)]">
      <div className="flex gap-1 overflow-x-auto border-b border-[#edf1ef] px-4 pt-2" role="tablist" aria-label="Settings sections">{tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-[10px] font-semibold ${tab === item.key ? 'border-[#20836a] text-[#17735d]' : 'border-transparent text-[#87928d] hover:text-[#45554d]'}`}>{item.title}</button>)}</div>
      <div className="p-4 md:p-6"><div className="mb-5"><h2 className="text-sm font-semibold text-[#2e4037]">{selected.title}</h2><p className="mt-1 text-[10px] text-[#929d98]">Changes are saved on the server and are used by applicable transaction and inventory calculations.</p></div>
        {isLoading && !data && <div className="h-48 animate-pulse rounded-xl bg-[#eef2ef]" aria-label="Loading settings" />}
        {error && !data && <div className="rounded-lg border border-[#f0d3cf] bg-[#fff5f3] p-3 text-xs text-[#ad514c]" role="alert">{error.message}<button className="ml-2 font-semibold underline" onClick={() => mutate()}>Retry</button></div>}
        {data && tab === 'preferences' && <PreferencesPanel />}
        {data && tab !== 'preferences' && <SettingsEditor key={`${tab}-${String(data[tab].updatedAt)}`} section={tab} initial={data[tab]} />}
      </div>
    </section>
    <p className="mt-4 text-[10px] text-[#98a39e]">Settings are currently stored in local JSON files. For real pharmacy operations, migrate to a durable database and validate backups, access control, and applicable pharmacy and tax requirements before use.</p>
  </main>
}
