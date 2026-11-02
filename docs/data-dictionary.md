# Med Easy data dictionary

## Shared conventions

- **Identifiers:** stable prefixed identifiers in `prefix_NNN` form; e.g. `med_001`, `sale_014`, and `bat_035`. IDs are references, never array positions.
- **Timestamps:** UTC ISO 8601 strings (`YYYY-MM-DDTHH:mm:ss.sssZ`). Business dates use ISO date-only strings (`YYYY-MM-DD`) and are interpreted in the pharmacy's local timezone.
- **Money:** integer paise, never floating-point rupees. INR display converts with `rupees = paise / 100`, formatted with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`. Sample GST rates are basis points (500 = 5%); they are configurable fictional data, not tax guidance.
- **Quantities:** integer units in the referenced medicine's configured retail unit. Batch ledger movements use signed integer deltas; zero is not a movement.
- **Soft deletion:** catalog entities use `status: active | inactive`; transactions are retained and use domain status enums.
- **Demo identities:** seed users contain profile/role metadata only. They intentionally contain no passwords or password hashes. Runtime account credentials, sessions, and one-time setup verification tokens are stored separately in local JSON files.

## Entities and relationships

| Entity | Seed file | Primary references / notes |
| --- | --- | --- |
| User | `users.json` | Roles: admin, pharmacist, cashier. Profile only; no credential fields. |
| Account | `accounts.json` | Runtime only; normalized email and salted scrypt hash. Never returned by APIs. |
| Session | `sessions.json` | Runtime only; stores a hash of the opaque HttpOnly cookie token and its expiry. |
| Verification | `verifications.json` | Runtime only; one-time account setup token hashes, purpose, and expiry. |
| Category | `categories.json` | Medicines reference `categoryId`. |
| Unit | `units.json` | Medicines reference `unitId`. |
| Medicine | `medicines.json` | References category/unit; stores sample pricing, GST basis points, reorder level. |
| Supplier | `suppliers.json` | Batches and purchases reference suppliers. |
| Patient | `patients.json` | Sales, quotations, and received payments reference patients. |
| Doctor | `doctors.json` | Optional reference from sales. |
| Inventory batch | `batches.json` | References medicine/supplier; has expiry, batch prices, and opening quantity. |
| Purchase | `purchases.json` | References supplier; totals reconcile to purchase items. |
| Purchase line item | `purchase-items.json` | References purchase/medicine and optional batch; draft purchase items have no batch. |
| Sale | `sales.json` | Optional patient/doctor references; references creating user. |
| Sale line item | `sale-items.json` | References sale/medicine/specific batch. |
| Quotation | `quotations.json` | Optional patient and creating user; does not reserve or move stock. |
| Quotation line item | `quotation-items.json` | References quotation/medicine. |
| Payment | `payments.json` | References patient/supplier and one sale/purchase transaction. Aggregate allocations equal paid amount and cannot exceed transaction total. |
| Expense | `expenses.json` | Amount, category, method, and cash-book inclusion flag. |
| Cash-book entry | `cash-book-entries.json` | Exactly one payment or expense source; amount mirrors source. |
| Stock movement | `stock-movements.json` | References a batch and a purchase, sale, or adjustment source. Signed delta. |
| Stock adjustment | `stock-adjustments.json` | Contains one or more batch adjustment lines and references creating user. |
| Pharmacy settings | `pharmacy-settings.json` | Singleton `set_pharmacy`, includes opening-stock date and INR currency. |
| Tax settings | `tax-settings.json` | Singleton `set_tax`, configurable sample GST rates. |
| Invoice settings | `invoice-settings.json` | Singleton `set_invoice`, document prefixes and next sequence values. |

### Stock snapshot and ledger rules

Seeded `openingQuantity` values represent the quantity at the `openingStockAsOf` date in pharmacy settings; these seed baselines are not duplicated as movement rows. Runtime-created batches must start at zero, and opening balances are established using a documented stock adjustment so each runtime stock change is auditable. Stock on hand is derived as:

`openingQuantity + purchase_receipt deltas - sale quantities + adjustment deltas`.

Only received purchases affect stock. Sales in this seed set are completed/partially paid and each line has a sale movement. Draft/cancelled purchases and quotations never change stock. The validator asserts non-negative ending quantities and rejects draft-purchase movements.

### Financial rules

Line `lineTotalPaise` is recomputed as `quantity * unitPricePaise - discountPaise + taxPaise`; `taxPaise` is rounded from the taxable line base and `taxRateBps`. Header subtotal, discount, tax, and total are sums of their lines. `paidPaise` is a derived reconciliation target for recorded payments, not a client-supplied amount. API mutations must recalculate all totals and stock from trusted records.
