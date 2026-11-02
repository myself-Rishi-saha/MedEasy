'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { Bell, ChevronDown, Command, LogOut, Menu, Search, Settings, UserRound, X } from 'lucide-react'
import { navigation } from '@/lib/med-easy-data'
import Image from "next/image";

type ShellUser = { id: string; name: string; email: string; role: 'admin' | 'pharmacist' | 'cashier' }

const routePermissions: Record<string, string> = {
  '/dashboard': 'dashboard:read', '/medicines': 'catalog:read', '/categories': 'catalog:read', '/units': 'catalog:read',
  '/suppliers': 'suppliers:read', '/patients': 'patients:read', '/doctors': 'doctors:read', '/inventory': 'inventory:read',
  '/purchases': 'purchases:read', '/sales': 'sales:read', '/quotations': 'quotations:read', '/payments': 'payments:read',
  '/expenses': 'expenses:read', '/cash-book': 'cash-book:read', '/reports': 'reports:read', '/users': 'users:read', '/settings': 'settings:read',
}
const clientPermissions: Record<ShellUser['role'], string[]> = {
  admin: ['*'],
  pharmacist: ['dashboard:read', 'catalog:read', 'inventory:read', 'sales:read', 'purchases:read', 'patients:read', 'doctors:read', 'quotations:read', 'reports:read'],
  cashier: ['dashboard:read', 'catalog:read', 'inventory:read', 'sales:read', 'patients:read', 'quotations:read', 'payments:read'],
}
function canNavigate(role: ShellUser['role'], href: string) {
  const permission = routePermissions[href]
  const permissions = clientPermissions[role]
  return Boolean(permission && (permissions.includes('*') || permissions.includes(permission)))
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export function MedEasyShell({ children, title, user, pharmacy }: { children: React.ReactNode; title: string; user: ShellUser; pharmacy: { name: string; city: string; state: string } }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  async function signOut() {
    setLoggingOut(true)
    setLogoutError('')
    try {
      const response = await fetch('/api/auth/sign-out', { method: 'POST' })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.message || 'Could not sign out. Please try again.')
      router.replace('/login')
      router.refresh()
    } catch (cause) {
      setLogoutError(cause instanceof Error ? cause.message : 'Could not sign out. Please try again.')
    } finally {
      setLoggingOut(false)
    }
  }
  return (
    <div className="min-h-screen bg-[#f6f8f7] text-[#182522]">
      {mobileOpen && <button className="fixed inset-0 z-30 bg-slate-950/35 md:hidden" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col border-r border-[#e8eeeb] bg-white transition-transform md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[72px] items-center justify-between border-b border-[#edf1ef] px-5">
          {/* <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
         
            <Image
              src="/logo.jpg"
              alt="Med Easy Logo"
              width={40}
              height={40}
              className="size-10 rounded-xl object-contain"
              priority
            />
            <span><span className="block text-[16px] font-bold tracking-tight text-[#162522]">med easy</span><span className="block text-[10px] font-medium tracking-[.12em] text-[#8c9995]">PHARMACY SUITE</span></span>
          </Link> */}
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
            onClick={() => setMobileOpen(false)}
          >
            <Image
              src="/logo.jpg"
              alt="Med Easy Logo"
              width={44}
              height={44}
              className="size-11 object-contain"
              priority
              unoptimized
            />

            <span>
              <span className="block text-[16px] font-bold tracking-tight text-[#162522]">
                MedEasy
              </span>
              <span className="block text-[10px] font-medium tracking-[.12em] text-[#8c9995]">
                PHARMACY SUITE
              </span>
            </span>
          </Link>
          <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-[#e8eeeb] bg-[#f8faf9] px-3 py-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[#e8f4f0] text-[#157a62]"><Command size={14} /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{pharmacy.name}</p><p className="truncate text-[10px] text-[#83908c]">{pharmacy.city}, {pharmacy.state}</p></div><ChevronDown size={14} className="text-slate-400" />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-5" aria-label="Main navigation">
          {navigation.filter((section) => section.items.some((item) => canNavigate(user.role, item.href))).map((section) => <div key={section.group} className="mb-5">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.13em] text-[#98a39f]">{section.group}</p>
            <div className="flex flex-col gap-1">
              {section.items.filter((item) => canNavigate(user.role, item.href)).map((item) => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))
                const Icon = item.icon
                return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`group flex h-9 items-center gap-3 rounded-lg px-3 text-[12px] font-medium transition-colors ${active ? 'bg-[#eaf5f1] text-[#126b56]' : 'text-[#61706b] hover:bg-[#f5f8f6] hover:text-[#26342f]'}`}>
                  <Icon size={16} strokeWidth={1.8} /><span className="flex-1">{item.label}</span>{active && <span className="size-1.5 rounded-full bg-[#158064]" />}
                </Link>
              })}
            </div>
          </div>)}
        </nav>
        <div className="border-t border-[#edf1ef] p-4">
          <div className="flex items-center gap-3 rounded-xl bg-[#f7faf8] p-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#d8eee7] text-[11px] font-bold text-[#176e59]">{initials(user.name)}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{user.name}</p><p className="text-[10px] capitalize text-[#899590]">{user.role === 'admin' ? 'Administrator' : user.role}</p></div><span className="size-2 rounded-full bg-[#21a67b]" />
          </div>
          <p className="mt-3 text-center text-[10px] text-[#a4afab]">Local JSON · single-instance demo</p>
        </div>
      </aside>

      <div className="min-h-screen md:pl-[250px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-[#e8eeeb] bg-white/95 px-4 backdrop-blur md:px-8">
          <button className="rounded-lg p-2 text-[#52625d] hover:bg-[#f3f7f5] md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-semibold text-[#22322d]">{title}</p><p className="hidden text-[10px] text-[#9aa5a1] sm:block">{pharmacy.name} <span className="px-1">/</span> {title}</p></div>
          <label className="hidden h-9 w-[220px] items-center gap-2 rounded-lg border border-[#e8eeeb] bg-[#fbfcfb] px-3 md:flex">
            <Search size={15} className="text-[#99a49f]" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229 && search.trim()) router.push(`/medicines?q=${encodeURIComponent(search.trim())}`) }} placeholder="Search medicines" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-[#a3adaa]" />
          </label>
          <button type="button" onClick={() => router.push('/inventory')} className="relative rounded-lg p-2 text-[#66746f] hover:bg-[#f3f7f5]" aria-label="Review inventory alerts" title="Review inventory alerts"><Bell size={18} /></button>
          <div className="relative">
            <button onClick={() => setUserOpen(!userOpen)} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-[#f3f7f5]" aria-expanded={userOpen} aria-label="User menu"><span className="flex size-8 items-center justify-center rounded-full bg-[#d8eee7] text-[11px] font-bold text-[#176e59]">{initials(user.name)}</span><ChevronDown size={14} className="hidden text-[#7c8984] sm:block" /></button>
            {userOpen && <div className="absolute right-0 top-11 z-50 w-48 rounded-xl border border-[#e8eeeb] bg-white p-1.5 shadow-xl"><p className="truncate px-3 py-2 text-xs font-semibold">{user.name}</p>{canNavigate(user.role, '/settings') && <><Link href="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#586761] hover:bg-[#f4f8f6]"><UserRound size={14} /> Profile</Link><Link href="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#586761] hover:bg-[#f4f8f6]"><Settings size={14} /> Settings</Link></>}{logoutError && <p role="alert" className="mx-2 my-1 rounded bg-[#fff5f3] px-2 py-1.5 text-[10px] text-[#ad514c]">{logoutError}</p>}<button type="button" onClick={() => void signOut()} disabled={loggingOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[#ad514c] hover:bg-[#fff5f4] disabled:opacity-50"><LogOut size={14} /> {loggingOut ? 'Signing out…' : 'Sign out'}</button></div>}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-8">{children}</main>
        <footer className="px-8 pb-6 text-center text-[10px] text-[#9aa5a1]">Med Easy · Local JSON storage · Demo use only</footer>
      </div>
    </div>
  )
}
