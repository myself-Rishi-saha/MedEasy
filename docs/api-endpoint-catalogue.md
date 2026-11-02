# API endpoint catalogue

The detailed query/body/response conventions and status codes are in `api-specification.md`. The catalogue below is the route-level inventory. Collection routes support `GET` and `POST`; item routes support `GET`, `PATCH`, and soft-deactivation `DELETE` where permitted.

## Health and authentication

- `GET /api/health`
- `POST /api/auth/sign-up/email`
- `POST /api/auth/sign-in/email`
- `GET /api/auth/get-session`
- `POST /api/auth/sign-out`

## Core domain resources

For each resource, support `GET/POST /api/v1/{resource}` and `GET/PATCH/DELETE /api/v1/{resource}/{id}` according to the generic resource contract:

`medicines`, `categories`, `units`, `suppliers`, `patients`, `doctors`, `users`, `batches`, `inventory`, `stock-movements`, `stock-adjustments`, `purchases`, `purchase-items`, `sales`, `sale-items`, `quotations`, `quotation-items`, `payments`, `expenses`, `cash-book`, `settings`.

- `POST /api/v1/users/{id}/setup-token` — admin-only one-time account setup token issue/reissue; only the token hash is persisted.

Nested transaction lines:

- `GET/POST /api/v1/purchases/{id}/items`
- `GET/POST /api/v1/sales/{id}/items`
- `GET/POST /api/v1/quotations/{id}/items`

Singleton/aggregate endpoints:

- `GET /api/v1/dashboard`
- `GET /api/v1/reports/{report}`
- `GET/PATCH /api/v1/settings/{section}` (`pharmacy`, `tax`, `invoice`)
- `POST /api/v1/demo/reset` (development + admin only)

## Filters and pagination

Supported common query parameters are `q`, `page`, `pageSize`, `sortBy`, `sortOrder`, and `status`. Domain-specific filters include `medicineId`, `supplierId`, `patientId`, `doctorId`, `batchId`, `categoryId`, `method`, `transactionType`, `sourceId`, `from`, `to`, `expiryBefore`, `lowStock`, and report/date ranges. Handlers must reject invalid dates, non-positive pagination, oversized pages, and unrecognized sort fields rather than interpolating arbitrary values.

The implemented Phase 4 master-data and inventory routes require a valid JSON-backed session and server-side role permission. Auth routes are limited to sign-up, sign-in, session lookup, and sign-out. Do not expose patient, user, or stock data through an unauthenticated catch-all route; transaction and other non-Phase-4 resources remain outside this implementation.
