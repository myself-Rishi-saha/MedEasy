import {
  Activity, Archive, Banknote, BarChart3, Boxes, BriefcaseMedical, ClipboardList, CreditCard,
  FileText, HeartPulse, LayoutDashboard, Package, Pill, Receipt, Settings, ShieldCheck, ShoppingCart,
  Stethoscope, Tags, Truck, Users, Wallet, type LucideIcon,
} from 'lucide-react'

export type NavItem = { label: string; href: string; icon: LucideIcon }
export const navigation: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }] },
  { group: 'Inventory', items: [
    { label: 'Medicines', href: '/medicines', icon: Pill }, { label: 'Categories', href: '/categories', icon: Tags },
    { label: 'Units', href: '/units', icon: Boxes }, { label: 'Suppliers', href: '/suppliers', icon: Truck },
    { label: 'Inventory', href: '/inventory', icon: Archive },
  ] },
  { group: 'Transactions', items: [
    { label: 'Sales & billing', href: '/sales', icon: ShoppingCart }, { label: 'Purchases', href: '/purchases', icon: ClipboardList },
    { label: 'Quotations', href: '/quotations', icon: FileText }, { label: 'Customers', href: '/patients', icon: HeartPulse },
    { label: 'Doctors', href: '/doctors', icon: Stethoscope },
  ] },
  { group: 'Finance', items: [
    { label: 'Payments', href: '/payments', icon: CreditCard }, { label: 'Expenses', href: '/expenses', icon: Receipt },
    { label: 'Cash book', href: '/cash-book', icon: Wallet }, { label: 'Reports', href: '/reports', icon: BarChart3 },
  ] },
  { group: 'Administration', items: [
    { label: 'Users', href: '/users', icon: Users }, { label: 'Settings', href: '/settings', icon: Settings },
  ] },
]

export const medicines = [
  { name: 'Dolo 650mg', sku: 'MED-0001', generic: 'Paracetamol', category: 'Analgesics', unit: 'Strip', maker: 'Micro Labs', price: 30, stock: 248, min: 50, status: 'In stock', batch: 'DL24081', expiry: '2027-08-31' },
  { name: 'Augmentin 625 Duo', sku: 'MED-0002', generic: 'Amoxicillin + Clavulanate', category: 'Antibiotics', unit: 'Strip', maker: 'GSK', price: 202, stock: 18, min: 30, status: 'Low stock', batch: 'AU91302', expiry: '2026-12-19' },
  { name: 'Cetirizine 10mg', sku: 'MED-0003', generic: 'Cetirizine', category: 'Allergy', unit: 'Strip', maker: 'Cipla', price: 24, stock: 136, min: 40, status: 'In stock', batch: 'CT56330', expiry: '2027-05-30' },
  { name: 'Shelcal 500', sku: 'MED-0004', generic: 'Calcium + Vitamin D3', category: 'Supplements', unit: 'Bottle', maker: 'Torrent', price: 138, stock: 9, min: 25, status: 'Low stock', batch: 'SH18867', expiry: '2026-11-24' },
  { name: 'Azithral 500', sku: 'MED-0005', generic: 'Azithromycin', category: 'Antibiotics', unit: 'Strip', maker: 'Alembic', price: 112, stock: 76, min: 20, status: 'In stock', batch: 'AZ28105', expiry: '2027-01-15' },
  { name: 'Pantocid 40', sku: 'MED-0006', generic: 'Pantoprazole', category: 'Gastro', unit: 'Strip', maker: 'Sun Pharma', price: 119, stock: 0, min: 30, status: 'Out of stock', batch: 'PA33410', expiry: '2026-10-08' },
  { name: 'Volini Spray 100ml', sku: 'MED-0007', generic: 'Diclofenac', category: 'Pain relief', unit: 'Bottle', maker: 'Sun Pharma', price: 185, stock: 44, min: 12, status: 'In stock', batch: 'VO44220', expiry: '2027-09-02' },
  { name: 'ORS Orange 21g', sku: 'MED-0008', generic: 'Oral Rehydration Salts', category: 'Hydration', unit: 'Pack', maker: 'Cipla', price: 22, stock: 12, min: 35, status: 'Low stock', batch: 'OR73010', expiry: '2026-12-12' },
]

export const sales = [
  { id: 'INV-2024-0824', customer: 'Ananya Sharma', date: '24 Oct 2024', items: 3, total: 1240, paid: 1240, method: 'UPI', status: 'Completed' },
  { id: 'INV-2024-0823', customer: 'Walk-in customer', date: '24 Oct 2024', items: 2, total: 385, paid: 385, method: 'Cash', status: 'Completed' },
  { id: 'INV-2024-0822', customer: 'Rohit Mehta', date: '24 Oct 2024', items: 5, total: 2180, paid: 1500, method: 'Credit', status: 'Partially paid' },
  { id: 'INV-2024-0821', customer: 'Meera Iyer', date: '23 Oct 2024', items: 1, total: 202, paid: 202, method: 'Card', status: 'Completed' },
  { id: 'INV-2024-0820', customer: 'Walk-in customer', date: '23 Oct 2024', items: 4, total: 845, paid: 845, method: 'UPI', status: 'Completed' },
]
export const purchases = [
  { id: 'PUR-2024-0312', supplier: 'Apollo Distributors', date: '24 Oct 2024', items: 12, subtotal: 18450, tax: 922, total: 19372, paid: 15000, status: 'Received' },
  { id: 'PUR-2024-0311', supplier: 'MedPlus Wholesale', date: '22 Oct 2024', items: 8, subtotal: 9720, tax: 486, total: 10206, paid: 10206, status: 'Received' },
  { id: 'PUR-2024-0310', supplier: 'Cipla Healthcare', date: '21 Oct 2024', items: 5, subtotal: 6380, tax: 319, total: 6699, paid: 0, status: 'Draft' },
]
export const customers = [
  { name: 'Ananya Sharma', phone: '+91 98765 43210', email: 'ananya.s@email.com', address: 'Indiranagar, Bengaluru', balance: 0, status: 'Active' },
  { name: 'Rohit Mehta', phone: '+91 99887 76655', email: 'rohit.m@email.com', address: 'Koramangala, Bengaluru', balance: 680, status: 'Active' },
  { name: 'Meera Iyer', phone: '+91 98450 12345', email: 'meera.i@email.com', address: 'Jayanagar, Bengaluru', balance: 0, status: 'Active' },
  { name: 'Arjun Rao', phone: '+91 99001 22110', email: 'arjun.r@email.com', address: 'Whitefield, Bengaluru', balance: 1240, status: 'Active' },
]
export const suppliers = [
  { name: 'Apollo Distributors', contact: 'Vikram Nair', phone: '+91 80 4123 9876', email: 'orders@apollodist.in', gstin: '29AABCA1234F1Z5', address: 'Peenya Industrial Area, Bengaluru', balance: 24500, status: 'Active' },
  { name: 'MedPlus Wholesale', contact: 'Priya Reddy', phone: '+91 80 4455 0099', email: 'supply@medpluswholesale.in', gstin: '29AACCM7862G1Z1', address: 'Rajajinagar, Bengaluru', balance: 0, status: 'Active' },
  { name: 'Cipla Healthcare', contact: 'Sameer Joshi', phone: '+91 22 2482 6000', email: 'trade@cipla.com', gstin: '27AAACC1450B1Z8', address: 'Bandra East, Mumbai', balance: 12800, status: 'Active' },
]
export const doctors = [
  { name: 'Dr. Kavita Rao', registration: 'KMC-2014-04218', specialization: 'General Physician', phone: '+91 98451 66220', email: 'kavita.rao@clinic.in', clinic: 'Rao Family Clinic', address: 'Indiranagar, Bengaluru' },
  { name: 'Dr. Arvind Menon', registration: 'KMC-2009-01836', specialization: 'Paediatrics', phone: '+91 99009 44102', email: 'arvind@childcare.in', clinic: 'Little Steps Clinic', address: 'Koramangala, Bengaluru' },
  { name: 'Dr. Sneha Kapoor', registration: 'KMC-2018-07344', specialization: 'Dermatology', phone: '+91 98861 22550', email: 'sneha@skinwell.in', clinic: 'Skinwell Centre', address: 'Jayanagar, Bengaluru' },
]
export const categories = [
  { name: 'Antibiotics', description: 'Prescription antibiotic medicines', count: 42, status: 'Active' },
  { name: 'Analgesics', description: 'Pain and fever relief', count: 36, status: 'Active' },
  { name: 'Supplements', description: 'Vitamins and nutritional supplements', count: 29, status: 'Active' },
  { name: 'Allergy', description: 'Allergy and antihistamine care', count: 18, status: 'Active' },
]
export const units = [
  { name: 'Strip', code: 'STR', description: 'Blister pack of tablets', count: 94, status: 'Active' },
  { name: 'Bottle', code: 'BTL', description: 'Liquid or capsule bottle', count: 36, status: 'Active' },
  { name: 'Piece', code: 'PCS', description: 'Individual unit', count: 28, status: 'Active' },
  { name: 'Tube', code: 'TUB', description: 'Topical tube', count: 14, status: 'Active' },
]
export const inventoryRows = medicines.map((medicine, index) => ({
  ...medicine, supplier: ['Apollo Distributors', 'MedPlus Wholesale', 'Cipla Healthcare'][index % 3],
  purchased: '12 Sep 2024', qtyPurchased: medicine.stock + 18, purchasePrice: Math.round(medicine.price * 0.62),
  movement: index % 2 ? 'Sale' : 'Purchase',
}))
export const payments = [
  { id: 'PAY-0482', date: '24 Oct 2024', direction: 'Received', party: 'Ananya Sharma', invoice: 'INV-2024-0824', method: 'UPI', amount: 1240, reference: 'UPI240903', status: 'Completed' },
  { id: 'PAY-0481', date: '24 Oct 2024', direction: 'Paid', party: 'Apollo Distributors', invoice: 'PUR-2024-0312', method: 'Bank transfer', amount: 15000, reference: 'NEFT102488', status: 'Completed' },
  { id: 'PAY-0480', date: '23 Oct 2024', direction: 'Received', party: 'Meera Iyer', invoice: 'INV-2024-0821', method: 'Card', amount: 202, reference: 'POS-8812', status: 'Completed' },
]
export const quotations = [
  { id: 'QUO-2024-0118', customer: 'Arjun Rao', date: '24 Oct 2024', valid: '31 Oct 2024', items: 4, subtotal: 3240, discount: 120, tax: 156, total: 3276, status: 'Sent' },
  { id: 'QUO-2024-0117', customer: 'Ananya Sharma', date: '23 Oct 2024', valid: '30 Oct 2024', items: 2, subtotal: 890, discount: 0, tax: 45, total: 935, status: 'Accepted' },
  { id: 'QUO-2024-0116', customer: 'Walk-in customer', date: '20 Oct 2024', valid: '23 Oct 2024', items: 1, subtotal: 450, discount: 0, tax: 23, total: 473, status: 'Expired' },
]
export const expenses = [
  { category: 'Rent', description: 'Shop rent — October', date: '01 Oct 2024', amount: 28000, method: 'Bank transfer', reference: 'RENT-OCT', notes: 'Monthly lease' },
  { category: 'Utilities', description: 'Electricity bill', date: '18 Oct 2024', amount: 3240, method: 'UPI', reference: 'BESCOM-8821', notes: '' },
  { category: 'Supplies', description: 'Thermal receipt rolls', date: '20 Oct 2024', amount: 840, method: 'Cash', reference: 'EXP-221', notes: '' },
]
export const users = [
  { name: 'Aarav Patel', username: 'aarav.admin', role: 'Administrator', status: 'Active', lastLogin: 'Today, 09:42 AM' },
  { name: 'Neha Kulkarni', username: 'neha.pharmacist', role: 'Pharmacist', status: 'Active', lastLogin: 'Today, 08:15 AM' },
  { name: 'Ravi Kumar', username: 'ravi.cashier', role: 'Cashier', status: 'Active', lastLogin: 'Yesterday, 07:30 PM' },
]
export const chartData = [
  { day: 'Mon', sales: 18400, purchases: 12400 }, { day: 'Tue', sales: 22100, purchases: 15800 },
  { day: 'Wed', sales: 19800, purchases: 11200 }, { day: 'Thu', sales: 26700, purchases: 18300 },
  { day: 'Fri', sales: 24300, purchases: 14600 }, { day: 'Sat', sales: 31800, purchases: 20700 },
  { day: 'Sun', sales: 28600, purchases: 17200 },
]

export const inr = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
export const dateIN = (date: string) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
