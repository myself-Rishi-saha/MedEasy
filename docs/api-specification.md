# Med Easy API specification

## Base URL and response envelope

Versioned domain endpoints use `/api/v1`; JSON-backed email/password auth uses `/api/auth/*`; the readiness probe is `/api/health`.

```json
{ "success": true, "message": "Operation completed", "data": {} }
```

```json
{ "success": false, "message": "The request could not be completed", "code": "VALIDATION_ERROR", "errors": [] }
```

Success responses contain `success`, `message`, and `data`. Errors contain `success`, `message`, `code`, and `errors` (`[{ "path": "field", "message": "..." }]`). Internal exceptions are logged with a request identifier only; raw file paths, database details, passwords, and raw error text are never returned.

## Authentication and authorization

Use the JSON-backed email/password endpoints, `GET /api/auth/get-session`, and `POST /api/auth/sign-out`. User profiles live in `users.json`; password hashes, opaque session-token hashes, and one-time account-setup token hashes live separately in runtime `accounts.json`, `sessions.json`, and `verifications.json`. Passwords use Node.js scrypt with a per-account random salt. Session cookies are HttpOnly, secure on HTTPS, and server-verified on every protected request. Server handlers reject missing/expired sessions with `401`, inactive users with `403`, and enforce role permissions. The first active admin profile can bootstrap the workspace; additional users require a one-time setup token issued by an admin. Verification tokens are stored only as hashes and expire after 48 hours. No email delivery or password-reset flow is configured.

## Generic resource contract

For each resource below:

- `GET /api/v1/{resource}` — list; query parameters: `q` (case-insensitive name/label search), `page` (1-based, default 1), `pageSize` (default 20, maximum 100), `sortBy` (allowlisted field), `sortOrder` (`asc|desc`), plus resource filters such as `status`, foreign-key IDs, date ranges, and transaction status. Response data is `{ items, pagination: { page, pageSize, total, totalPages } }`.
- `POST /api/v1/{resource}` — create; JSON body is the resource's create schema. Ignore/reject client IDs, computed totals, stock levels, roles, and payment statuses where those are server-derived.
- `GET /api/v1/{resource}/{id}` — detail; malformed IDs return `400`, absent IDs return `404`.
- `PATCH /api/v1/{resource}/{id}` — partial update; validate server-side, preserve immutable identifiers, recalculate transaction totals, and enforce valid state transitions.
- `DELETE /api/v1/{resource}/{id}` — soft deactivate for catalogs/users; return `204` only for explicitly supported deactivation, otherwise `405`.

Permission groups: catalog (categories, units, medicines), suppliers, patients, doctors, inventory, purchases, sales, quotations, payments, expenses, cash book, settings, users, reports. Admin has all permissions; pharmacist/cashier permissions are defined in `lib/domain/server-utils.ts`. Users, settings, payments, and financial reports require stricter role checks.

## Endpoint catalogue

| Group | Collection and detail endpoints | Special operations |
| --- | --- | --- |
| Authentication | `/api/auth/sign-up/email`, `/api/auth/sign-in/email`, `/api/auth/get-session`, `/api/auth/sign-out` | JSON-backed email/password; one-time setup tokens are hashed in `verifications.json`. |
| Dashboard | `GET /api/v1/dashboard` | Summary statistics and alerts from live repository data. |
| Medicines | `/api/v1/medicines`, `/api/v1/medicines/{id}` | Search by name, SKU, generic, category, active state. |
| Categories | `/api/v1/categories`, `/api/v1/categories/{id}` | Search/name/status. |
| Units | `/api/v1/units`, `/api/v1/units/{id}` | Search/code/status. |
| Suppliers | `/api/v1/suppliers`, `/api/v1/suppliers/{id}` | Search/name/city/status. |
| Patients | `/api/v1/patients`, `/api/v1/patients/{id}` | Search/name/phone/status; protect personal data. |
| Doctors | `/api/v1/doctors`, `/api/v1/doctors/{id}` | Search/name/registration/specialization. |
| Users | `/api/v1/users`, `/api/v1/users/{id}` | Admin only; create/reissue returns a one-time setup token, never a password or hash. |
| Batches | `/api/v1/batches`, `/api/v1/batches/{id}` | Filter medicine/supplier/expiry; current quantity is derived from ledger. |
| Inventory | `/api/v1/inventory`, `/api/v1/inventory/{medicineId}` | Low-stock, expired, and near-expiry views; stock is never client-supplied. |
| Stock movements | `/api/v1/stock-movements`, `/api/v1/stock-movements/{id}` | Read-only ledger; filters by batch, medicine, source, and date range. |
| Stock adjustments | `/api/v1/stock-adjustments`, `/api/v1/stock-adjustments/{id}` | `POST /api/v1/stock-adjustments`; lines apply atomically after permission and stock validation. |
| Purchases | `/api/v1/purchases`, `/api/v1/purchases/{id}` | `GET/POST /api/v1/purchases/{id}/items`; receive transitions add stock exactly once. |
| Purchase items | `/api/v1/purchase-items`, `/api/v1/purchase-items/{id}` | Nested route is preferred for transaction-scoped writes. |
| Sales | `/api/v1/sales`, `/api/v1/sales/{id}` | `GET/POST /api/v1/sales/{id}/items`; server checks batch availability/expiry and derives totals. |
| Sale items | `/api/v1/sale-items`, `/api/v1/sale-items/{id}` | Nested route is preferred for transaction-scoped writes. |
| Quotations | `/api/v1/quotations`, `/api/v1/quotations/{id}` | `GET/POST /api/v1/quotations/{id}/items`; does not reserve or move stock. |
| Quotation items | `/api/v1/quotation-items`, `/api/v1/quotation-items/{id}` | Convert accepted quotation to sale only through a validated service. |
| Payments | `/api/v1/payments`, `/api/v1/payments/{id}` | Server validates direction/party/transaction and outstanding amount. |
| Expenses | `/api/v1/expenses`, `/api/v1/expenses/{id}` | Filter category/method/date range. |
| Cash book | `/api/v1/cash-book`, `/api/v1/cash-book/{id}` | Read-only derived entries; linked payment/expense, date range. |
| Settings | `/api/v1/settings`, `/api/v1/settings/{section}` | Sections: `pharmacy`, `tax`, `invoice`; admin only. |
| Reports | `GET /api/v1/reports/{report}` | Reports: sales, purchases, inventory, expiry, payments, expenses, tax; date filters. |
| Health | `GET /api/health` | Public liveness only; does not expose environment or filesystem details. |
| Demo-data reset | `POST /api/v1/demo/reset` | Development-only, admin-only, explicit confirmation body; resets runtime JSON from seeds. Disabled in production. |

## Status codes

- `200` successful read/update, `201` create, `204` successful soft deactivation.
- `400` malformed JSON/path/query, `401` unauthenticated, `403` unauthorized/inactive, `404` missing record, `405` unsupported method, `409` duplicate/conflicting state, `413` request too large, `422` schema/business validation, `429` rate limit, `500` sanitized internal failure, `503` auth/storage temporarily unavailable.

All money fields use integer paise. All business dates use `YYYY-MM-DD`; timestamps use UTC ISO 8601. Pagination and sort fields are allowlisted; no raw JSON filenames or database paths are accepted from clients.

## Implementation status

Implemented now: `/api/health`, JSON-backed sign-up/sign-in/session/sign-out, protected JSON CRUD endpoints for master data and inventory, role checks, common response/error contracts, Zod validation, and the existing local JSON store. Transaction workflows beyond the Phase 4 master-data/inventory scope remain separate. JSON files are for local development and controlled demonstrations, not a production system of record.
