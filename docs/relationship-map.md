# Med Easy relationship map

```text
Category ──< Medicine >── Unit
Medicine ──< InventoryBatch >── Supplier
Supplier ──< Purchase ──< PurchaseLineItem >── Medicine
                               └── optional InventoryBatch
Patient ──< Sale ──< SaleLineItem >── Medicine
Doctor ─────┘          └── InventoryBatch
Patient ──< Quotation ──< QuotationLineItem >── Medicine
User ───────┘
Patient ──< received Payment >── Sale
Supplier ──< paid Payment >──── Purchase
Payment ──0..1 CashBookEntry
Expense ──0..1 CashBookEntry
InventoryBatch ──< StockMovement >── Purchase | Sale | StockAdjustment
User ──< StockAdjustment ──< adjustment lines >── InventoryBatch / Medicine
PharmacySettings (singleton) ── opening-stock date
TaxSettings (singleton) ── sample GST rates
InvoiceSettings (singleton) ── document number prefixes
```

`──<` means one-to-many. `0..1` indicates an optional single source link. Seed records use stable prefixed IDs; every reference is checked by `scripts/validate-seeds.mjs`.
