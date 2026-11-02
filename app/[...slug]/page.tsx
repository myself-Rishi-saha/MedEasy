import { notFound, redirect } from 'next/navigation'
import { MedEasyShell } from '@/components/med-easy-shell'
import { DashboardApiPage } from '@/components/dashboard-api-page'
import { ReportsApiPage } from '@/components/reports-api-page'
import { SettingsApiPage } from '@/components/settings-api-page'
import { TransactionWorkspace } from '@/components/transaction-workspace'
import { InventoryApiPage } from '@/components/inventory-api-page'
import { LoginPage } from '@/components/login-page'
import { MasterDataPage } from '@/components/master-data-page'
import { getCurrentServerUser } from '@/lib/auth/server'
import { hasPermission } from '@/lib/domain/server-utils'
import { getPharmacySummary } from '@/lib/services/settings-service'

const pageTitles: Record<string, string> = {
  dashboard: 'Dashboard', medicines: 'Medicines', categories: 'Categories', units: 'Units', suppliers: 'Suppliers',
  patients: 'Customers & patients', doctors: 'Doctors', inventory: 'Inventory', purchases: 'Purchases', sales: 'Sales & billing',
  quotations: 'Quotations', payments: 'Payments', expenses: 'Expenses', 'cash-book': 'Cash book', reports: 'Reports', users: 'Users', settings: 'Settings',
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params
  const [section = 'dashboard', action, operation] = slug

  if (section === 'setup') return <LoginPage initialMode="setup" />
  const user = await getCurrentServerUser()
  if (section === 'login') {
    if (user) redirect('/dashboard')
    return <LoginPage />
  }
  if (!user) redirect('/login')
  if (!Object.hasOwn(pageTitles, section)) notFound()
  const pharmacy = await getPharmacySummary()

  const pagePermissions: Record<string, string> = {
    dashboard: 'dashboard:read', medicines: 'catalog:read', categories: 'catalog:read', units: 'catalog:read',
    suppliers: 'suppliers:read', patients: 'patients:read', doctors: 'doctors:read', inventory: 'inventory:read',
    purchases: action === 'new' || operation === 'edit' ? 'purchases:write' : 'purchases:read', sales: action === 'new' || operation === 'edit' ? 'sales:write' : 'sales:read',
    quotations: action === 'new' || operation === 'edit' ? 'quotations:write' : 'quotations:read', payments: action === 'new' ? 'payments:write' : 'payments:read', expenses: action === 'new' || operation === 'edit' ? 'expenses:write' : 'expenses:read',
    'cash-book': 'cash-book:read', reports: 'reports:read', users: 'users:read', settings: 'settings:read',
  }
  const permission = pagePermissions[section] ?? 'dashboard:read'
  if (!hasPermission(user.role, permission)) {
    return <MedEasyShell title="Access denied" user={user} pharmacy={pharmacy}><section className="rounded-xl border border-[#ead8d5] bg-white p-6"><h1 className="text-lg font-semibold text-[#8f4039]">Access denied</h1><p className="mt-2 text-sm text-[#73817a]">Your workspace role does not allow access to this section.</p></section></MedEasyShell>
  }

  const masterDataSections = ['medicines', 'categories', 'units', 'suppliers', 'patients', 'doctors', 'users']
  let content: React.ReactNode = null
  if (section === 'dashboard') content = <DashboardApiPage />
  else if (section === 'inventory') content = <InventoryApiPage />
  else if (masterDataSections.includes(section)) content = <MasterDataPage section={section} />
  else if (section === 'reports') content = <ReportsApiPage />
  else if (section === 'settings') content = <SettingsApiPage />
  else if (['sales', 'purchases', 'quotations', 'payments', 'expenses', 'cash-book'].includes(section)) {
    content = <TransactionWorkspace section={section as 'sales' | 'purchases' | 'quotations' | 'payments' | 'expenses' | 'cash-book'} action={action} operation={operation} />
  }

  return <MedEasyShell title={pageTitles[section] || 'Dashboard'} user={user} pharmacy={pharmacy}>{content}</MedEasyShell>
}

