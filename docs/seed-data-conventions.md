# Phase 2 handoff conventions

- Preserve the prefixed IDs, ISO-8601 UTC timestamps, ISO date-only business dates, integer paise, and GST basis-point conventions.
- Keep seed JSON immutable and separate from runtime JSON. Runtime initialization must be create-if-absent, never unconditional overwrite.
- Derive stock from batch opening quantity plus transaction/adjustment stock movements. Draft and cancelled transactions do not affect stock.
- Recalculate money, tax, payment allocations, and stock on the server. Do not trust submitted totals, paid status, or stock levels.
- Keep user profile seeds credential-free. Store password hashes, session-token hashes, and one-time account-setup token hashes in separate local JSON runtime collections (`accounts.json`, `sessions.json`, `verifications.json`); never return hashes from domain APIs.
- Sample medicines, patients, tax rates, and transactions are fictional. GST values are examples only.
