// import { z } from "zod";
// import {
//   ApiError,
//   errorResponse,
//   parseJsonBody,
//   successResponse,
// } from "@/lib/api/responses";
// import { jsonAuth, requireRequestUser } from "@/lib/auth";
// import { authJsonStore } from "@/lib/auth/json-auth-store.mjs";
// import { entitySchemas, type EntityCollection } from "@/lib/domain/schemas";
// import { generateId, requirePermission } from "@/lib/domain/server-utils";
// import type { User, StockMovement } from "@/lib/domain/types";
// import { JsonRepository } from "@/lib/repositories/json-repository";
// import {
//   getInventorySnapshot,
//   filterInventoryRows,
// } from "@/lib/services/inventory-query-service";
// import {
//   applyStockAdjustment,
//   getBatchQuantityOnHand,
// } from "@/lib/services/inventory-service";
// import { isValidDateOnly } from "@/lib/domain/server-utils";
// import { listRecords } from "@/lib/services/records-service";
// import { validateEntityReferences } from "@/lib/services/reference-validation";
// import {
//   createStockAdjustmentService,
//   StockAdjustmentServiceError,
//   toPublicStockAdjustment,
// } from "@/lib/services/stock-adjustment-service.mjs";
// import {
//   getDashboardData,
//   type DashboardRange,
// } from "@/lib/services/dashboard-service";
// import { getReportData, reportCsv } from "@/lib/services/reporting-service";
// import {
//   getUserPreferences,
//   getWorkspaceSettings,
//   updateUserPreferences,
//   updateWorkspaceSettings,
// } from "@/lib/services/settings-service";
// import { jsonStore } from "@/lib/storage/json-store";
// import {
//   cancelPurchase,
//   cancelSale,
//   completeSale,
//   convertQuotation,
//   createExpense,
//   createManualCashEntry,
//   createPurchaseDraft,
//   createQuotationDraft,
//   createSaleDraft,
//   expenseInputSchema,
//   getExpenseSummary,
//   getPaymentDetail,
//   getPaymentSummary,
//   getTransactionDetail,
//   listCashBook,
//   manualCashEntryInputSchema,
//   paymentInputSchema,
//   purchaseDraftInputSchema,
//   quotationDraftInputSchema,
//   quotationStatusInputSchema,
//   recordPayment,
//   receivePurchase,
//   saleCompletionInputSchema,
//   saleDraftInputSchema,
//   updateExpense,
//   updatePurchaseDraft,
//   updateQuotationDraft,
//   updateQuotationStatus,
//   updateSaleDraft,
// } from "@/lib/services/transaction-workflows";

// export type V1RouteContext = { params: Promise<{ path: string[] }> };

// const resources = {
//   medicines: { collection: "medicines", group: "catalog", prefix: "med" },
//   categories: { collection: "categories", group: "catalog", prefix: "cat" },
//   units: { collection: "units", group: "catalog", prefix: "uni" },
//   suppliers: { collection: "suppliers", group: "suppliers", prefix: "sup" },
//   patients: { collection: "patients", group: "patients", prefix: "pat" },
//   doctors: { collection: "doctors", group: "doctors", prefix: "doc" },
//   users: { collection: "users", group: "users", prefix: "usr" },
//   batches: { collection: "batches", group: "inventory", prefix: "bat" },
//   "stock-movements": {
//     collection: "stock-movements",
//     group: "inventory",
//     prefix: "mov",
//   },
//   "stock-adjustments": {
//     collection: "stock-adjustments",
//     group: "inventory",
//     prefix: "adj",
//   },
//   purchases: { collection: "purchases", group: "purchases", prefix: "pur" },
//   sales: { collection: "sales", group: "sales", prefix: "sal" },
//   quotations: { collection: "quotations", group: "quotations", prefix: "quo" },
//   payments: { collection: "payments", group: "payments", prefix: "pay" },
//   expenses: { collection: "expenses", group: "expenses", prefix: "exp" },
// } as const;

// type ResourceName = keyof typeof resources;
// const duplicateFields: Partial<Record<ResourceName, string[][]>> = {
//   medicines: [["sku"]],
//   categories: [["name"]],
//   units: [["name"], ["code"]],
//   suppliers: [["gstin"]],
//   patients: [["phone"]],
//   doctors: [["registrationNumber"]],
//   users: [["email"]],
//   batches: [["supplierId", "batchNumber"]],
// };
// const filtersByResource: Partial<Record<ResourceName, string[]>> = {
//   medicines: ["status", "categoryId", "unitId"],
//   categories: ["status"],
//   units: ["status"],
//   suppliers: ["status", "city"],
//   patients: ["status", "city"],
//   doctors: ["status", "city", "specialization"],
//   users: ["status", "role"],
//   batches: ["medicineId", "supplierId", "expiryDate"],
//   "stock-movements": ["batchId", "medicineId", "sourceId", "movementType"],
//   "stock-adjustments": ["createdByUserId", "status"],
//   purchases: ["supplierId", "status"],
//   sales: ["patientId", "doctorId", "status"],
//   quotations: ["patientId", "status"],
//   payments: [
//     "direction",
//     "partyType",
//     "partyId",
//     "transactionType",
//     "transactionId",
//     "method",
//   ],
//   expenses: ["category", "method"],
// };
// const permissionGroups: Record<string, string> = {
//   medicines: "catalog",
//   categories: "catalog",
//   units: "catalog",
//   suppliers: "suppliers",
//   patients: "patients",
//   doctors: "doctors",
//   users: "users",
//   batches: "inventory",
//   inventory: "inventory",
//   "stock-movements": "inventory",
//   "stock-adjustments": "inventory",
//   purchases: "purchases",
//   sales: "sales",
//   quotations: "quotations",
//   payments: "payments",
//   expenses: "expenses",
//   "cash-book": "cash-book",
//   dashboard: "dashboard",
//   reports: "reports",
//   settings: "settings",
// };
// const fieldMap: Record<string, string[]> = {
//   medicines: ["name", "sku", "genericName", "email", "phone"],
//   categories: ["name", "description"],
//   units: ["name", "code", "description"],
//   suppliers: ["name", "contactName", "email", "phone", "gstin", "city"],
//   patients: ["name", "email", "phone", "city"],
//   doctors: ["name", "registrationNumber", "specialization", "email", "phone"],
//   users: ["name", "email"],
//   batches: ["batchNumber", "expiryDate", "receivedOn"],
//   "stock-movements": ["sourceId", "batchId", "medicineId"],
//   "stock-adjustments": ["adjustmentNumber", "reason"],
//   purchases: ["invoiceNumber", "supplierInvoiceNumber"],
//   sales: ["invoiceNumber"],
//   quotations: ["quotationNumber"],
//   payments: ["reference"],
//   expenses: ["description", "reference"],
// };

// const processStockAdjustment = createStockAdjustmentService({
//   store: jsonStore,
//   getBatchQuantityOnHand,
//   applyStockAdjustment,
//   generateId,
// });

// function collectionFor(name: ResourceName) {
//   return resources[name].collection as EntityCollection;
// }

// function isResourceName(resource: string): resource is ResourceName {
//   return Object.hasOwn(resources, resource);
// }

// function requireGroupPermission(user: User, resource: string, method: string) {
//   if (!Object.hasOwn(permissionGroups, resource))
//     throw new ApiError(404, "NOT_FOUND", "Resource not found");
//   const group = permissionGroups[resource];
//   if (!group) throw new ApiError(404, "NOT_FOUND", "Resource not found");
//   const mode = method === "GET" ? "read" : "write";
//   requirePermission(user.role, `${group}:${mode}`);
//   if (resource === "users" && user.role !== "admin")
//     throw new ApiError(
//       403,
//       "FORBIDDEN",
//       "Administrator permission is required",
//     );
// }

// function queryNumber(value: string | null, fallback: number) {
//   if (value === null) return fallback;
//   if (!/^\d+$/.test(value))
//     throw new ApiError(
//       422,
//       "VALIDATION_ERROR",
//       "Pagination values must be positive integers",
//     );
//   const parsed = Number(value);
//   if (!Number.isSafeInteger(parsed))
//     throw new ApiError(
//       422,
//       "VALIDATION_ERROR",
//       "Pagination values must be safe integers",
//     );
//   return parsed;
// }

// function queryFilters(search: URLSearchParams, resource: ResourceName) {
//   const allowed = new Set(filtersByResource[resource] ?? []);
//   const filters: Record<string, string> = {};
//   for (const [key, value] of search.entries()) {
//     if (allowed.has(key) && value.trim()) filters[key] = value.trim();
//   }
//   return filters;
// }

// async function parseObjectBody(request: Request) {
//   const length = Number(request.headers.get("content-length") ?? 0);
//   if (length > 1_000_000)
//     throw new ApiError(413, "INVALID_REQUEST", "Request body is too large");
//   return parseJsonBody(request, z.record(z.string(), z.unknown()));
// }

// function assertNoServerFields(body: Record<string, unknown>) {
//   const protectedFields = ["id", "createdAt", "updatedAt"];
//   if (protectedFields.some((field) => field in body))
//     throw new ApiError(
//       422,
//       "VALIDATION_ERROR",
//       "Identifiers and timestamps are server-managed",
//     );
// }

// function valuesMatch(
//   record: Record<string, unknown>,
//   candidate: Record<string, unknown>,
//   fields: string[],
// ) {
//   return fields.every((field) => {
//     const left = record[field];
//     const right = candidate[field];
//     if (typeof left === "string" && typeof right === "string")
//       return (
//         left.trim().toLocaleLowerCase("en-IN") ===
//         right.trim().toLocaleLowerCase("en-IN")
//       );
//     return left === right;
//   });
// }

// async function ensureNoDuplicate(
//   resource: ResourceName,
//   candidate: Record<string, unknown>,
//   exceptId?: string,
// ) {
//   const fields = duplicateFields[resource] ?? [];
//   if (!fields.length) return;
//   const current = await jsonStore.read<Record<string, unknown>[]>(
//     collectionFor(resource),
//   );
//   for (const fieldGroup of fields) {
//     if (
//       fieldGroup.some(
//         (field) =>
//           candidate[field] === undefined ||
//           candidate[field] === null ||
//           candidate[field] === "",
//       )
//     )
//       continue;
//     if (
//       current.some(
//         (record) =>
//           record.id !== exceptId && valuesMatch(record, candidate, fieldGroup),
//       )
//     ) {
//       const labels = fieldGroup.join(" and ");
//       throw new ApiError(
//         409,
//         "CONFLICT",
//         `A record with the same ${labels} already exists`,
//       );
//     }
//   }
// }

// function idPrefix(resource: ResourceName) {
//   return resources[resource].prefix;
// }

// function safeUser(user: User) {
//   return { ...user };
// }

// async function listResource(resource: ResourceName, search: URLSearchParams) {
//   const repository = new JsonRepository<
//     Record<string, unknown> & { id: string }
//   >(collectionFor(resource));
//   const result = await listRecords(repository, {
//     q: search.get("q") ?? undefined,
//     page: queryNumber(search.get("page"), 1),
//     pageSize: queryNumber(search.get("pageSize"), 20),
//     sortBy: search.get("sortBy") ?? undefined,
//     sortOrder: (search.get("sortOrder") ?? undefined) as
//       | "asc"
//       | "desc"
//       | undefined,
//     filters: queryFilters(search, resource),
//   });
//   if (resource === "stock-adjustments")
//     return {
//       ...result,
//       items: result.items.map((record) => toPublicStockAdjustment(record)),
//     };
//   if (
//     ["purchases", "sales", "quotations", "payments", "expenses"].includes(
//       resource,
//     )
//   ) {
//     return {
//       ...result,
//       items: result.items.map((record) =>
//         Object.fromEntries(
//           Object.entries(record).filter(
//             ([key]) => !/[Ii]dempotencyKey|[Hh]ash/.test(key),
//           ),
//         ),
//       ),
//     };
//   }
//   if (resource !== "users") return result;
//   const accounts =
//     await authJsonStore.read<Array<{ userId: string }>>("accounts");
//   return {
//     ...result,
//     items: result.items.map((user) => ({
//       ...safeUser(user as unknown as User),
//       accountSetupRequired: !accounts.some(
//         (account) => account.userId === user.id,
//       ),
//     })),
//   };
// }

// async function readResource(resource: ResourceName, id: string) {
//   const repository = new JsonRepository<
//     Record<string, unknown> & { id: string }
//   >(collectionFor(resource));
//   const { getRecord } = await import("@/lib/services/records-service");
//   const record = await getRecord(repository, id);
//   if (resource === "stock-adjustments") return toPublicStockAdjustment(record);
//   if (resource !== "users") return record;
//   const accounts =
//     await authJsonStore.read<Array<{ userId: string }>>("accounts");
//   return {
//     ...safeUser(record as unknown as User),
//     accountSetupRequired: !accounts.some((account) => account.userId === id),
//   };
// }

// async function createResource(
//   resource: ResourceName,
//   request: Request,
//   user: User,
// ) {
//   if (resource === "stock-movements" || resource === "stock-adjustments")
//     throw new ApiError(
//       405,
//       "INVALID_REQUEST",
//       "Use the dedicated inventory operation",
//     );
//   const body = await parseObjectBody(request);
//   assertNoServerFields(body);
//   if (resource === "batches" && body.openingQuantity !== 0)
//     throw new ApiError(
//       422,
//       "VALIDATION_ERROR",
//       "New batches must start at zero; establish opening stock with a documented stock adjustment",
//     );
//   if (resource === "users" && body.lastLoginAt !== undefined)
//     throw new ApiError(422, "VALIDATION_ERROR", "Last login is server-managed");
//   const timestamp = new Date().toISOString();
//   const serverValues: Record<string, unknown> = {
//     id: generateId(idPrefix(resource)),
//     createdAt: timestamp,
//     updatedAt: timestamp,
//     ...(resource === "users" ? { lastLoginAt: null } : {}),
//   };
//   const record = entitySchemas[collectionFor(resource)].parse({
//     ...body,
//     ...serverValues,
//   }) as unknown as Record<string, unknown> & { id: string };
//   await ensureNoDuplicate(resource, record);
//   await validateEntityReferences(collectionFor(resource), record);
//   const repository = new JsonRepository<
//     Record<string, unknown> & { id: string }
//   >(collectionFor(resource));
//   const created = await repository.create(record);
//   if (resource === "users") {
//     if (created.status !== "active")
//       return successResponse(
//         {
//           user: safeUser(created as unknown as User),
//           accountSetupRequired: true,
//         },
//         "User created; activate the profile before issuing a setup token",
//         201,
//       );
//     try {
//       const setupToken = await jsonAuth.issueAccountSetupToken(created.id);
//       return successResponse(
//         {
//           user: safeUser(created as unknown as User),
//           accountSetupToken: setupToken,
//           expiresInHours: 48,
//         },
//         "User created; share the one-time setup token securely",
//         201,
//       );
//     } catch (error) {
//       await jsonStore.update("users", (users: User[]) =>
//         users.filter((entry) => entry.id !== created.id),
//       );
//       throw error;
//     }
//   }
//   void user;
//   return successResponse(created, "Record created", 201);
// }

// async function updateResource(
//   resource: ResourceName,
//   id: string,
//   request: Request,
// ) {
//   if (resource === "stock-movements" || resource === "stock-adjustments")
//     throw new ApiError(405, "INVALID_REQUEST", "This resource is read-only");
//   const body = await parseObjectBody(request);
//   assertNoServerFields(body);
//   if (resource === "batches" && "openingQuantity" in body)
//     throw new ApiError(
//       422,
//       "VALIDATION_ERROR",
//       "Opening quantity is immutable; use a stock adjustment",
//     );
//   const repository = new JsonRepository<
//     Record<string, unknown> & { id: string }
//   >(collectionFor(resource));
//   if (!/^[a-z]{3}_[a-z0-9]{3,}$/i.test(id))
//     throw new ApiError(400, "INVALID_REQUEST", "Invalid record identifier");
//   const current = await repository.findById(id);
//   if (!current) throw new ApiError(404, "NOT_FOUND", "Record not found");
//   if (resource === "users" && "lastLoginAt" in body)
//     throw new ApiError(422, "VALIDATION_ERROR", "Last login is server-managed");
//   if (
//     resource === "users" &&
//     typeof body.email === "string" &&
//     body.email.trim().toLowerCase() !== String(current.email).toLowerCase()
//   ) {
//     const accounts =
//       await authJsonStore.read<Array<{ userId: string }>>("accounts");
//     if (accounts.some((account) => account.userId === id))
//       throw new ApiError(
//         409,
//         "CONFLICT",
//         "Email cannot be changed after an account is set up",
//       );
//   }
//   const updated = entitySchemas[collectionFor(resource)].parse({
//     ...current,
//     ...body,
//     id: current.id,
//     updatedAt: new Date().toISOString(),
//   }) as unknown as Record<string, unknown> & { id: string };
//   await ensureNoDuplicate(resource, updated, id);
//   await validateEntityReferences(collectionFor(resource), updated);
//   if (
//     resource === "users" &&
//     current.role === "admin" &&
//     current.status === "active" &&
//     (updated.role !== "admin" || updated.status !== "active")
//   ) {
//     const users = await jsonStore.read<User[]>("users");
//     if (
//       users.filter(
//         (entry) => entry.role === "admin" && entry.status === "active",
//       ).length <= 1
//     )
//       throw new ApiError(
//         409,
//         "CONFLICT",
//         "The last active administrator cannot be deactivated or demoted",
//       );
//   }
//   const saved = await repository.update(id, updated);
//   return successResponse(
//     resource === "users" ? safeUser(saved as unknown as User) : saved,
//     "Record updated",
//   );
// }

// async function deactivateResource(resource: ResourceName, id: string) {
//   if (
//     ![
//       "medicines",
//       "categories",
//       "units",
//       "suppliers",
//       "patients",
//       "doctors",
//       "users",
//     ].includes(resource)
//   ) {
//     throw new ApiError(
//       405,
//       "INVALID_REQUEST",
//       "Soft deactivation is not supported for this resource",
//     );
//   }
//   if (!/^[a-z]{3}_[a-z0-9]{3,}$/i.test(id))
//     throw new ApiError(400, "INVALID_REQUEST", "Invalid record identifier");
//   const repository = new JsonRepository<
//     Record<string, unknown> & { id: string; status?: string }
//   >(collectionFor(resource));
//   const current = await repository.findById(id);
//   if (!current) throw new ApiError(404, "NOT_FOUND", "Record not found");
//   if (
//     resource === "users" &&
//     current.role === "admin" &&
//     current.status === "active"
//   ) {
//     const users = await jsonStore.read<User[]>("users");
//     if (
//       users.filter(
//         (entry) => entry.role === "admin" && entry.status === "active",
//       ).length <= 1
//     )
//       throw new ApiError(
//         409,
//         "CONFLICT",
//         "The last active administrator cannot be deactivated",
//       );
//   }
//   await repository.update(id, { status: "inactive" });
//   return new Response(null, { status: 204 });
// }

// async function inventoryList(search: URLSearchParams) {
//   const snapshot = await getInventorySnapshot();
//   const view = search.get("view") ?? "current";
//   if (!["current", "low-stock", "near-expiry", "expired"].includes(view))
//     throw new ApiError(422, "VALIDATION_ERROR", "Unsupported inventory view");
//   const rows = filterInventoryRows(
//     snapshot.rows,
//     view,
//     snapshot.today,
//     snapshot.nearExpiryDate,
//   );
//   const result = await listRecords(
//     { list: async () => rows },
//     {
//       q: search.get("q") ?? undefined,
//       page: queryNumber(search.get("page"), 1),
//       pageSize: queryNumber(search.get("pageSize"), 20),
//       sortBy: search.get("sortBy") ?? "expiryDate",
//       sortOrder: (search.get("sortOrder") ?? "asc") as "asc" | "desc",
//       filters: Object.fromEntries(
//         ["medicineId", "status"].flatMap((key) =>
//           search.has(key) ? [[key, search.get(key)!]] : [],
//         ),
//       ),
//     },
//   );
//   return successResponse(
//     { ...result, summary: snapshot.summary, view },
//     "Inventory loaded",
//   );
// }

// async function inventoryDetail(medicineId: string) {
//   if (!/^[a-z]{3}_[a-z0-9]{3,}$/i.test(medicineId))
//     throw new ApiError(400, "INVALID_REQUEST", "Invalid medicine identifier");
//   const snapshot = await getInventorySnapshot();
//   const medicine = (await jsonStore.read<unknown[]>("medicines")).find(
//     (entry) =>
//       typeof entry === "object" &&
//       entry !== null &&
//       "id" in entry &&
//       entry.id === medicineId,
//   );
//   if (!medicine) throw new ApiError(404, "NOT_FOUND", "Medicine not found");
//   const batches = snapshot.rows.filter((row) => row.medicineId === medicineId);
//   const movements = await jsonStore.read<StockMovement[]>("stock-movements");
//   return successResponse(
//     {
//       medicine,
//       batches,
//       movements: movements.filter(
//         (movement) => movement.medicineId === medicineId,
//       ),
//     },
//     "Inventory detail loaded",
//   );
// }

// async function createStockAdjustmentRequest(request: Request, user: User) {
//   const idempotencyKey = request.headers.get("idempotency-key");
//   if (!idempotencyKey || !/^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey)) {
//     throw new ApiError(
//       400,
//       "INVALID_REQUEST",
//       "A valid Idempotency-Key header is required",
//     );
//   }
//   const lineSchema = z
//     .object({
//       batchId: z.string().regex(/^[a-z]{3}_[a-z0-9]+$/),
//       quantityDelta: z
//         .number()
//         .int()
//         .refine((value) => value !== 0),
//     })
//     .strict();
//   const bodySchema = z
//     .object({
//       reason: z.string().trim().min(3).max(250),
//       adjustedOn: z
//         .string()
//         .refine(isValidDateOnly, "Date must be a valid YYYY-MM-DD value")
//         .optional(),
//       lines: z.array(lineSchema).min(1).max(50),
//     })
//     .strict()
//     .refine(
//       (value) =>
//         new Set(value.lines.map((line) => line.batchId)).size ===
//         value.lines.length,
//       {
//         message: "Each batch may appear only once per adjustment",
//         path: ["lines"],
//       },
//     );
//   const body = await parseJsonBody(request, bodySchema);
//   let result;
//   try {
//     result = await processStockAdjustment({ body, user, idempotencyKey });
//   } catch (error) {
//     if (error instanceof StockAdjustmentServiceError)
//       throw new ApiError(error.status, error.code, error.message);
//     throw error;
//   }
//   return successResponse(result, "Stock adjustment recorded", 201);
// }

// async function handleGet(request: Request, path: string[], user: User) {
//   const [resource, id, nested] = path;
//   if (!resource) throw new ApiError(404, "NOT_FOUND", "Resource not found");
//   const search = new URL(request.url).searchParams;
//   if (resource === "preferences" && path.length === 1)
//     return successResponse(
//       await getUserPreferences(user.id),
//       "Preferences loaded",
//     );
//   requireGroupPermission(user, resource, "GET");
//   if (resource === "dashboard" && path.length === 1) {
//     const range = search.get("range") ?? "week";
//     if (!["week", "month", "year"].includes(range))
//       throw new ApiError(
//         422,
//         "VALIDATION_ERROR",
//         "Unsupported dashboard range",
//       );
//     return successResponse(
//       await getDashboardData(range as DashboardRange, user.id),
//       "Dashboard loaded",
//     );
//   }
//   if (resource === "reports" && path.length === 1) {
//     const isCsv = search.get("format") === "csv";
//     const report = await getReportData(search, user.id, isCsv);
//     if (isCsv)
//       return new Response(`\uFEFF${reportCsv(report.type, report.items)}`, {
//         headers: {
//           "Content-Type": "text/csv; charset=utf-8",
//           "Content-Disposition": `attachment; filename="med-easy-${report.type}-${report.from}-${report.to}.csv"`,
//           "Cache-Control": "private, no-store",
//         },
//       });
//     return successResponse(report, "Report loaded");
//   }
//   if (resource === "settings" && path.length === 1)
//     return successResponse(await getWorkspaceSettings(), "Settings loaded");
//   if (resource === "cash-book") {
//     if (id && id !== "summary") {
//       const entries =
//         await jsonStore.read<Record<string, unknown>[]>("cash-book-entries");
//       const entry = entries.find((record) => record.id === id);
//       if (!entry)
//         throw new ApiError(404, "NOT_FOUND", "Cash-book entry not found");
//       return successResponse(entry, "Cash-book entry loaded");
//     }
//     return successResponse(await listCashBook(search), "Cash book loaded");
//   }
//   if (resource === "payments" && id === "summary")
//     return successResponse(await getPaymentSummary(), "Payment summary loaded");
//   if (resource === "expenses" && id === "summary")
//     return successResponse(await getExpenseSummary(), "Expense summary loaded");
//   if (["purchases", "sales", "quotations"].includes(resource) && id) {
//     return successResponse(
//       await getTransactionDetail(
//         resource as "purchases" | "sales" | "quotations",
//         id,
//       ),
//       "Transaction loaded",
//     );
//   }
//   if (resource === "payments" && id)
//     return successResponse(await getPaymentDetail(id), "Payment detail loaded");
//   if (resource === "inventory") {
//     if (id) return inventoryDetail(id);
//     return inventoryList(search);
//   }
//   if (
//     resource === "batches" &&
//     id &&
//     nested === "movements" &&
//     path.length === 3
//   ) {
//     const batch = await readResource("batches", id);
//     const movements = await jsonStore.read<StockMovement[]>("stock-movements");
//     return successResponse(
//       { batch, items: movements.filter((movement) => movement.batchId === id) },
//       "Batch movement history loaded",
//     );
//   }
//   if (!isResourceName(resource))
//     throw new ApiError(404, "NOT_FOUND", "Resource not found");
//   const resourceName = resource;
//   if (id)
//     return successResponse(
//       await readResource(resourceName, id),
//       "Record loaded",
//     );
//   return successResponse(
//     await listResource(resourceName, search),
//     "Records loaded",
//   );
// }

// async function handlePost(request: Request, path: string[], user: User) {
//   const [resource, id, operation] = path;
//   if (!resource) throw new ApiError(404, "NOT_FOUND", "Resource not found");
//   requireGroupPermission(user, resource, "POST");
//   if (resource === "stock-adjustments" && !id)
//     return createStockAdjustmentRequest(request, user);
//   if (resource === "purchases") {
//     if (!id && path.length === 1)
//       return successResponse(
//         await createPurchaseDraft(
//           purchaseDraftInputSchema.parse(await parseObjectBody(request)),
//           user,
//           request.headers.get("idempotency-key"),
//         ),
//         "Purchase draft created",
//         201,
//       );
//     if (id && operation === "receive" && path.length === 3)
//       return successResponse(
//         await receivePurchase(id, request.headers.get("idempotency-key")),
//         "Purchase received",
//       );
//     if (id && operation === "cancel" && path.length === 3)
//       return successResponse(
//         await cancelPurchase(id, request.headers.get("idempotency-key")),
//         "Purchase cancelled",
//       );
//   }
//   if (resource === "sales") {
//     if (!id && path.length === 1)
//       return successResponse(
//         await createSaleDraft(
//           saleDraftInputSchema.parse(await parseObjectBody(request)),
//           user,
//           request.headers.get("idempotency-key"),
//         ),
//         "Sale draft created",
//         201,
//       );
//     if (id && operation === "complete" && path.length === 3)
//       return successResponse(
//         await completeSale(
//           id,
//           saleCompletionInputSchema.parse(await parseObjectBody(request)),
//           user,
//           request.headers.get("idempotency-key"),
//         ),
//         "Sale completed",
//       );
//     if (id && operation === "cancel" && path.length === 3)
//       return successResponse(
//         await cancelSale(id, request.headers.get("idempotency-key")),
//         "Sale cancelled or reversed",
//       );
//   }
//   if (resource === "quotations") {
//     if (!id && path.length === 1)
//       return successResponse(
//         await createQuotationDraft(
//           quotationDraftInputSchema.parse(await parseObjectBody(request)),
//           user,
//           request.headers.get("idempotency-key"),
//         ),
//         "Quotation draft created",
//         201,
//       );
//     if (id && operation === "status" && path.length === 3)
//       return successResponse(
//         await updateQuotationStatus(
//           id,
//           quotationStatusInputSchema.parse(await parseObjectBody(request))
//             .status,
//         ),
//         "Quotation status updated",
//       );
//     if (id && operation === "convert-to-sale" && path.length === 3)
//       return successResponse(
//         await convertQuotation(
//           id,
//           user,
//           request.headers.get("idempotency-key"),
//         ),
//         "Quotation converted to a draft sale",
//         201,
//       );
//   }
//   if (resource === "payments" && !id && path.length === 1)
//     return successResponse(
//       await recordPayment(
//         paymentInputSchema.parse(await parseObjectBody(request)),
//         user,
//         request.headers.get("idempotency-key"),
//       ),
//       "Payment recorded",
//       201,
//     );
//   if (resource === "expenses") {
//     if (!id && path.length === 1)
//       return successResponse(
//         await createExpense(
//           expenseInputSchema.parse(await parseObjectBody(request)),
//           request.headers.get("idempotency-key"),
//         ),
//         "Expense recorded",
//         201,
//       );
//   }
//   if (resource === "cash-book" && !id && path.length === 1)
//     return successResponse(
//       await createManualCashEntry(
//         manualCashEntryInputSchema.parse(await parseObjectBody(request)),
//         request.headers.get("idempotency-key"),
//       ),
//       "Cash-book entry recorded",
//       201,
//     );
//   if (
//     resource === "users" &&
//     id &&
//     operation === "setup-token" &&
//     path.length === 3
//   ) {
//     const setupToken = await jsonAuth.issueAccountSetupToken(id);
//     return successResponse(
//       { setupToken, expiresInHours: 48 },
//       "One-time setup token issued",
//     );
//   }
//   if (id || !isResourceName(resource))
//     throw new ApiError(404, "NOT_FOUND", "Resource not found");
//   return createResource(resource, request, user);
// }

// async function handlePatch(request: Request, path: string[], user: User) {
//   const [resource, id] = path;
//   if (!resource) throw new ApiError(404, "NOT_FOUND", "Resource not found");
//   if (resource === "preferences" && !id && path.length === 1) {
//     return successResponse(
//       await updateUserPreferences(user.id, await parseObjectBody(request)),
//       "Preferences updated",
//     );
//   }
//   if (resource === "settings" && id && path.length === 2) {
//     requireGroupPermission(user, resource, "PATCH");
//     if (!["pharmacy", "tax", "invoice", "inventory"].includes(id))
//       throw new ApiError(404, "NOT_FOUND", "Settings section not found");
//     return successResponse(
//       await updateWorkspaceSettings(
//         id as "pharmacy" | "tax" | "invoice" | "inventory",
//         await parseObjectBody(request),
//       ),
//       "Settings updated",
//     );
//   }
//   if (!id) throw new ApiError(404, "NOT_FOUND", "Resource not found");
//   requireGroupPermission(user, resource, "PATCH");
//   if (path.length === 2 && resource === "purchases")
//     return successResponse(
//       await updatePurchaseDraft(
//         id,
//         purchaseDraftInputSchema.parse(await parseObjectBody(request)),
//       ),
//       "Purchase draft updated",
//     );
//   if (path.length === 2 && resource === "sales")
//     return successResponse(
//       await updateSaleDraft(
//         id,
//         saleDraftInputSchema.parse(await parseObjectBody(request)),
//       ),
//       "Sale draft updated",
//     );
//   if (path.length === 2 && resource === "quotations")
//     return successResponse(
//       await updateQuotationDraft(
//         id,
//         quotationDraftInputSchema.parse(await parseObjectBody(request)),
//       ),
//       "Quotation draft updated",
//     );
//   if (path.length === 2 && resource === "expenses")
//     return successResponse(
//       await updateExpense(
//         id,
//         expenseInputSchema.parse(await parseObjectBody(request)),
//         request.headers.get("idempotency-key"),
//       ),
//       "Expense updated",
//     );
//   if (!isResourceName(resource) || path.length !== 2)
//     throw new ApiError(404, "NOT_FOUND", "Resource not found");
//   return updateResource(resource, id, request);
// }

// async function handleDelete(path: string[], user: User) {
//   const [resource, id] = path;
//   if (!resource || !id || !isResourceName(resource))
//     throw new ApiError(404, "NOT_FOUND", "Resource not found");
//   requireGroupPermission(user, resource, "DELETE");
//   return deactivateResource(resource, id);
// }

// export async function handleV1(
//   request: Request,
//   method: "GET" | "POST" | "PATCH" | "DELETE",
//   context: V1RouteContext,
// ) {
//   try {
//     const user = await requireRequestUser(request);
//     const { path } = await context.params;
//     if (method === "GET") return await handleGet(request, path, user);
//     if (method === "POST") return await handlePost(request, path, user);
//     if (method === "PATCH") return await handlePatch(request, path, user);
//     return await handleDelete(path, user);
//   } catch (error) {
//     return errorResponse(error);
//   }
// }

import { z } from "zod";
import {
  ApiError,
  errorResponse,
  parseJsonBody,
  successResponse,
} from "@/lib/api/responses";
import { jsonAuth, requireRequestUser } from "@/lib/auth";
import { authJsonStore } from "@/lib/auth/json-auth-store.mjs";
import { entitySchemas, type EntityCollection } from "@/lib/domain/schemas";
import { generateId, requirePermission } from "@/lib/domain/server-utils";
import type { User, StockMovement } from "@/lib/domain/types";
import { JsonRepository } from "@/lib/repositories/json-repository";
import {
  getInventorySnapshot,
  filterInventoryRows,
} from "@/lib/services/inventory-query-service";
import {
  applyStockAdjustment,
  getBatchQuantityOnHand,
} from "@/lib/services/inventory-service";
import { isValidDateOnly } from "@/lib/domain/server-utils";
import { listRecords } from "@/lib/services/records-service";
import { validateEntityReferences } from "@/lib/services/reference-validation";
import {
  createStockAdjustmentService,
  StockAdjustmentServiceError,
  toPublicStockAdjustment,
} from "@/lib/services/stock-adjustment-service.mjs";
import {
  getDashboardData,
  type DashboardRange,
} from "@/lib/services/dashboard-service";
import { getReportData, reportCsv } from "@/lib/services/reporting-service";
import {
  getUserPreferences,
  getWorkspaceSettings,
  updateUserPreferences,
  updateWorkspaceSettings,
} from "@/lib/services/settings-service";
import { jsonStore } from "@/lib/storage/json-store";
import {
  cancelPurchase,
  cancelSale,
  completeSale,
  convertQuotation,
  createExpense,
  createManualCashEntry,
  createPurchaseDraft,
  createQuotationDraft,
  createSaleDraft,
  expenseInputSchema,
  getExpenseSummary,
  getPaymentDetail,
  getPaymentSummary,
  getTransactionDetail,
  listCashBook,
  manualCashEntryInputSchema,
  paymentInputSchema,
  purchaseDraftInputSchema,
  quotationDraftInputSchema,
  quotationStatusInputSchema,
  recordPayment,
  receivePurchase,
  saleCompletionInputSchema,
  saleDraftInputSchema,
  updateExpense,
  updatePurchaseDraft,
  updateQuotationDraft,
  updateQuotationStatus,
  updateSaleDraft,
} from "@/lib/services/transaction-workflows";

export type V1RouteContext = { params: Promise<{ path: string[] }> };

const resources = {
  medicines: { collection: "medicines", group: "catalog", prefix: "med" },
  categories: { collection: "categories", group: "catalog", prefix: "cat" },
  units: { collection: "units", group: "catalog", prefix: "uni" },
  suppliers: { collection: "suppliers", group: "suppliers", prefix: "sup" },
  patients: { collection: "patients", group: "patients", prefix: "pat" },
  doctors: { collection: "doctors", group: "doctors", prefix: "doc" },
  users: { collection: "users", group: "users", prefix: "usr" },
  batches: { collection: "batches", group: "inventory", prefix: "bat" },
  "stock-movements": {
    collection: "stock-movements",
    group: "inventory",
    prefix: "mov",
  },
  "stock-adjustments": {
    collection: "stock-adjustments",
    group: "inventory",
    prefix: "adj",
  },
  purchases: { collection: "purchases", group: "purchases", prefix: "pur" },
  sales: { collection: "sales", group: "sales", prefix: "sal" },
  quotations: { collection: "quotations", group: "quotations", prefix: "quo" },
  payments: { collection: "payments", group: "payments", prefix: "pay" },
  expenses: { collection: "expenses", group: "expenses", prefix: "exp" },
} as const;

type ResourceName = keyof typeof resources;

const duplicateFields: Partial<Record<ResourceName, string[][]>> = {
  medicines: [["sku"]],
  categories: [["name"]],
  units: [["name"], ["code"]],
  suppliers: [["gstin"]],
  patients: [["phone"]],
  doctors: [["registrationNumber"]],
  users: [["email"]],
  batches: [["supplierId", "batchNumber"]],
};

const filtersByResource: Partial<Record<ResourceName, string[]>> = {
  medicines: ["status", "categoryId", "unitId"],
  categories: ["status"],
  units: ["status"],
  suppliers: ["status", "city"],
  patients: ["status", "city"],
  doctors: ["status", "city", "specialization"],
  users: ["status", "role"],
  batches: ["medicineId", "supplierId", "expiryDate"],
  "stock-movements": ["batchId", "medicineId", "sourceId", "movementType"],
  "stock-adjustments": ["createdByUserId", "status"],
  purchases: ["supplierId", "status"],
  sales: ["patientId", "doctorId", "status"],
  quotations: ["patientId", "status"],
  payments: [
    "direction",
    "partyType",
    "partyId",
    "transactionType",
    "transactionId",
    "method",
  ],
  expenses: ["category", "method"],
};

const permissionGroups: Record<string, string> = {
  medicines: "catalog",
  categories: "catalog",
  units: "catalog",
  suppliers: "suppliers",
  patients: "patients",
  doctors: "doctors",
  users: "users",
  batches: "inventory",
  inventory: "inventory",
  "stock-movements": "inventory",
  "stock-adjustments": "inventory",
  purchases: "purchases",
  sales: "sales",
  quotations: "quotations",
  payments: "payments",
  expenses: "expenses",
  "cash-book": "cash-book",
  dashboard: "dashboard",
  reports: "reports",
  settings: "settings",
};

const fieldMap: Record<string, string[]> = {
  medicines: ["name", "sku", "genericName", "email", "phone"],
  categories: ["name", "description"],
  units: ["name", "code", "description"],
  suppliers: ["name", "contactName", "email", "phone", "gstin", "city"],
  // patients: ["name", "email", "phone", "city"],
  patients: ["phone"],
  doctors: ["name", "registrationNumber", "specialization", "email", "phone"],
  users: ["name", "email"],
  batches: ["batchNumber", "expiryDate", "receivedOn"],
  "stock-movements": ["sourceId", "batchId", "medicineId"],
  "stock-adjustments": ["adjustmentNumber", "reason"],
  purchases: ["invoiceNumber", "supplierInvoiceNumber"],
  sales: ["invoiceNumber"],
  quotations: ["quotationNumber"],
  payments: ["reference"],
  expenses: ["description", "reference"],
};

const processStockAdjustment = createStockAdjustmentService({
  store: jsonStore,
  getBatchQuantityOnHand,
  applyStockAdjustment,
  generateId,
});

function collectionFor(name: ResourceName) {
  return resources[name].collection as EntityCollection;
}

function isResourceName(resource: string): resource is ResourceName {
  return Object.hasOwn(resources, resource);
}

function requireGroupPermission(user: User, resource: string, method: string) {
  if (!Object.hasOwn(permissionGroups, resource))
    throw new ApiError(404, "NOT_FOUND", "Resource not found");

  const group = permissionGroups[resource];

  if (!group) throw new ApiError(404, "NOT_FOUND", "Resource not found");

  const mode = method === "GET" ? "read" : "write";

  requirePermission(user.role, `${group}:${mode}`);

  if (resource === "users" && user.role !== "admin")
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Administrator permission is required",
    );
}

function queryNumber(value: string | null, fallback: number) {
  if (value === null) return fallback;

  if (!/^\d+$/.test(value))
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Pagination values must be positive integers",
    );

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed))
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Pagination values must be safe integers",
    );

  return parsed;
}

function queryFilters(search: URLSearchParams, resource: ResourceName) {
  const allowed = new Set(filtersByResource[resource] ?? []);
  const filters: Record<string, string> = {};

  for (const [key, value] of search.entries()) {
    if (allowed.has(key) && value.trim()) filters[key] = value.trim();
  }

  return filters;
}

async function parseObjectBody(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);

  if (length > 1_000_000)
    throw new ApiError(413, "INVALID_REQUEST", "Request body is too large");

  return parseJsonBody(request, z.record(z.string(), z.unknown()));
}

function assertNoServerFields(body: Record<string, unknown>) {
  const protectedFields = ["id", "createdAt", "updatedAt"];

  if (protectedFields.some((field) => field in body))
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Identifiers and timestamps are server-managed",
    );
}

/**
 * Normalizes Indian phone numbers for duplicate comparison.
 *
 * Examples:
 * +91 90000 21000 -> 9000021000
 * +91-90000-21000 -> 9000021000
 * 9000021000      -> 9000021000
 */
function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }

  return digits;
}

function valuesMatch(
  record: Record<string, unknown>,
  candidate: Record<string, unknown>,
  fields: string[],
) {
  return fields.every((field) => {
    const left = record[field];
    const right = candidate[field];

    if (
      field === "phone" &&
      typeof left === "string" &&
      typeof right === "string"
    ) {
      return normalizePhone(left) === normalizePhone(right);
    }

    if (typeof left === "string" && typeof right === "string") {
      return (
        left.trim().toLocaleLowerCase("en-IN") ===
        right.trim().toLocaleLowerCase("en-IN")
      );
    }

    return left === right;
  });
}

async function ensureNoDuplicate(
  resource: ResourceName,
  candidate: Record<string, unknown>,
  exceptId?: string,
) {
  const fields = duplicateFields[resource] ?? [];

  if (!fields.length) return;

  const current = await jsonStore.read<Record<string, unknown>[]>(
    collectionFor(resource),
  );

  for (const fieldGroup of fields) {
    if (
      fieldGroup.some(
        (field) =>
          candidate[field] === undefined ||
          candidate[field] === null ||
          candidate[field] === "",
      )
    )
      continue;

    if (
      current.some(
        (record) =>
          record.id !== exceptId && valuesMatch(record, candidate, fieldGroup),
      )
    ) {
      const labels = fieldGroup.join(" and ");

      throw new ApiError(
        409,
        "CONFLICT",
        `A record with the same ${labels} already exists`,
      );
    }
  }
}

function idPrefix(resource: ResourceName) {
  return resources[resource].prefix;
}

function safeUser(user: User) {
  return { ...user };
}

async function listResource(resource: ResourceName, search: URLSearchParams) {
  const repository = new JsonRepository<
    Record<string, unknown> & { id: string }
  >(collectionFor(resource));

  const result = await listRecords(repository, {
    q: search.get("q") ?? undefined,
    page: queryNumber(search.get("page"), 1),
    pageSize: queryNumber(search.get("pageSize"), 20),
    sortBy: search.get("sortBy") ?? undefined,
    sortOrder: (search.get("sortOrder") ?? undefined) as
      | "asc"
      | "desc"
      | undefined,
    filters: queryFilters(search, resource),
  });

  if (resource === "stock-adjustments")
    return {
      ...result,
      items: result.items.map((record) => toPublicStockAdjustment(record)),
    };

  if (
    ["purchases", "sales", "quotations", "payments", "expenses"].includes(
      resource,
    )
  ) {
    return {
      ...result,
      items: result.items.map((record) =>
        Object.fromEntries(
          Object.entries(record).filter(
            ([key]) => !/[Ii]dempotencyKey|[Hh]ash/.test(key),
          ),
        ),
      ),
    };
  }

  if (resource !== "users") return result;

  const accounts =
    await authJsonStore.read<Array<{ userId: string }>>("accounts");

  return {
    ...result,
    items: result.items.map((user) => ({
      ...safeUser(user as unknown as User),
      accountSetupRequired: !accounts.some(
        (account) => account.userId === user.id,
      ),
    })),
  };
}

async function readResource(resource: ResourceName, id: string) {
  const repository = new JsonRepository<
    Record<string, unknown> & { id: string }
  >(collectionFor(resource));

  const { getRecord } = await import("@/lib/services/records-service");
  const record = await getRecord(repository, id);

  if (resource === "stock-adjustments") return toPublicStockAdjustment(record);
  if (resource !== "users") return record;

  const accounts =
    await authJsonStore.read<Array<{ userId: string }>>("accounts");

  return {
    ...safeUser(record as unknown as User),
    accountSetupRequired: !accounts.some((account) => account.userId === id),
  };
}

async function createResource(
  resource: ResourceName,
  request: Request,
  user: User,
) {
  if (resource === "stock-movements" || resource === "stock-adjustments")
    throw new ApiError(
      405,
      "INVALID_REQUEST",
      "Use the dedicated inventory operation",
    );

  const body = await parseObjectBody(request);
  assertNoServerFields(body);

  if (resource === "batches" && body.openingQuantity !== 0)
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "New batches must start at zero; establish opening stock with a documented stock adjustment",
    );

  if (resource === "users" && body.lastLoginAt !== undefined)
    throw new ApiError(422, "VALIDATION_ERROR", "Last login is server-managed");

  const timestamp = new Date().toISOString();

  const serverValues: Record<string, unknown> = {
    id: generateId(idPrefix(resource)),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(resource === "users" ? { lastLoginAt: null } : {}),
  };

  const record = entitySchemas[collectionFor(resource)].parse({
    ...body,
    ...serverValues,
  }) as unknown as Record<string, unknown> & { id: string };

  await ensureNoDuplicate(resource, record);
  await validateEntityReferences(collectionFor(resource), record);

  const repository = new JsonRepository<
    Record<string, unknown> & { id: string }
  >(collectionFor(resource));

  const created = await repository.create(record);

  if (resource === "users") {
    if (created.status !== "active")
      return successResponse(
        {
          user: safeUser(created as unknown as User),
          accountSetupRequired: true,
        },
        "User created; activate the profile before issuing a setup token",
        201,
      );

    try {
      const setupToken = await jsonAuth.issueAccountSetupToken(created.id);

      return successResponse(
        {
          user: safeUser(created as unknown as User),
          accountSetupToken: setupToken,
          expiresInHours: 48,
        },
        "User created; share the one-time setup token securely",
        201,
      );
    } catch (error) {
      await jsonStore.update("users", (users: User[]) =>
        users.filter((entry) => entry.id !== created.id),
      );

      throw error;
    }
  }

  void user;

  return successResponse(created, "Record created", 201);
}

async function updateResource(
  resource: ResourceName,
  id: string,
  request: Request,
) {
  if (resource === "stock-movements" || resource === "stock-adjustments")
    throw new ApiError(405, "INVALID_REQUEST", "This resource is read-only");

  const body = await parseObjectBody(request);
  assertNoServerFields(body);

  if (resource === "batches" && "openingQuantity" in body)
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Opening quantity is immutable; use a stock adjustment",
    );

  const repository = new JsonRepository<
    Record<string, unknown> & { id: string }
  >(collectionFor(resource));

  if (!/^[a-z]{3}_[a-z0-9]{3,}$/i.test(id))
    throw new ApiError(400, "INVALID_REQUEST", "Invalid record identifier");

  const current = await repository.findById(id);

  if (!current) throw new ApiError(404, "NOT_FOUND", "Record not found");

  if (resource === "users" && "lastLoginAt" in body)
    throw new ApiError(422, "VALIDATION_ERROR", "Last login is server-managed");

  if (
    resource === "users" &&
    typeof body.email === "string" &&
    body.email.trim().toLowerCase() !== String(current.email).toLowerCase()
  ) {
    const accounts =
      await authJsonStore.read<Array<{ userId: string }>>("accounts");

    if (accounts.some((account) => account.userId === id))
      throw new ApiError(
        409,
        "CONFLICT",
        "Email cannot be changed after an account is set up",
      );
  }

  const updated = entitySchemas[collectionFor(resource)].parse({
    ...current,
    ...body,
    id: current.id,
    updatedAt: new Date().toISOString(),
  }) as unknown as Record<string, unknown> & { id: string };

  await ensureNoDuplicate(resource, updated, id);
  await validateEntityReferences(collectionFor(resource), updated);

  if (
    resource === "users" &&
    current.role === "admin" &&
    current.status === "active" &&
    (updated.role !== "admin" || updated.status !== "active")
  ) {
    const users = await jsonStore.read<User[]>("users");

    if (
      users.filter(
        (entry) => entry.role === "admin" && entry.status === "active",
      ).length <= 1
    )
      throw new ApiError(
        409,
        "CONFLICT",
        "The last active administrator cannot be deactivated or demoted",
      );
  }

  const saved = await repository.update(id, updated);

  return successResponse(
    resource === "users" ? safeUser(saved as unknown as User) : saved,
    "Record updated",
  );
}

async function deactivateResource(resource: ResourceName, id: string) {
  if (
    ![
      "medicines",
      "categories",
      "units",
      "suppliers",
      "patients",
      "doctors",
      "users",
    ].includes(resource)
  ) {
    throw new ApiError(
      405,
      "INVALID_REQUEST",
      "Soft deactivation is not supported for this resource",
    );
  }

  if (!/^[a-z]{3}_[a-z0-9]{3,}$/i.test(id))
    throw new ApiError(400, "INVALID_REQUEST", "Invalid record identifier");

  const repository = new JsonRepository<
    Record<string, unknown> & { id: string; status?: string }
  >(collectionFor(resource));

  const current = await repository.findById(id);

  if (!current) throw new ApiError(404, "NOT_FOUND", "Record not found");

  if (
    resource === "users" &&
    current.role === "admin" &&
    current.status === "active"
  ) {
    const users = await jsonStore.read<User[]>("users");

    if (
      users.filter(
        (entry) => entry.role === "admin" && entry.status === "active",
      ).length <= 1
    )
      throw new ApiError(
        409,
        "CONFLICT",
        "The last active administrator cannot be deactivated",
      );
  }

  await repository.update(id, { status: "inactive" });

  return new Response(null, { status: 204 });
}

async function inventoryList(search: URLSearchParams) {
  const snapshot = await getInventorySnapshot();
  const view = search.get("view") ?? "current";

  if (!["current", "low-stock", "near-expiry", "expired"].includes(view))
    throw new ApiError(422, "VALIDATION_ERROR", "Unsupported inventory view");

  const rows = filterInventoryRows(
    snapshot.rows,
    view,
    snapshot.today,
    snapshot.nearExpiryDate,
  );

  const result = await listRecords(
    { list: async () => rows },
    {
      q: search.get("q") ?? undefined,
      page: queryNumber(search.get("page"), 1),
      pageSize: queryNumber(search.get("pageSize"), 20),
      sortBy: search.get("sortBy") ?? "expiryDate",
      sortOrder: (search.get("sortOrder") ?? "asc") as "asc" | "desc",
      filters: Object.fromEntries(
        ["medicineId", "status"].flatMap((key) =>
          search.has(key) ? [[key, search.get(key)!]] : [],
        ),
      ),
    },
  );

  return successResponse(
    { ...result, summary: snapshot.summary, view },
    "Inventory loaded",
  );
}

async function inventoryDetail(medicineId: string) {
  if (!/^[a-z]{3}_[a-z0-9]{3,}$/i.test(medicineId))
    throw new ApiError(400, "INVALID_REQUEST", "Invalid medicine identifier");

  const snapshot = await getInventorySnapshot();

  const medicine = (await jsonStore.read<unknown[]>("medicines")).find(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      "id" in entry &&
      entry.id === medicineId,
  );

  if (!medicine) throw new ApiError(404, "NOT_FOUND", "Medicine not found");

  const batches = snapshot.rows.filter((row) => row.medicineId === medicineId);
  const movements = await jsonStore.read<StockMovement[]>("stock-movements");

  return successResponse(
    {
      medicine,
      batches,
      movements: movements.filter(
        (movement) => movement.medicineId === medicineId,
      ),
    },
    "Inventory detail loaded",
  );
}

async function createStockAdjustmentRequest(request: Request, user: User) {
  const idempotencyKey = request.headers.get("idempotency-key");

  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{1,200}$/.test(idempotencyKey)) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "A valid Idempotency-Key header is required",
    );
  }

  const lineSchema = z
    .object({
      batchId: z.string().regex(/^[a-z]{3}_[a-z0-9]+$/),
      quantityDelta: z
        .number()
        .int()
        .refine((value) => value !== 0),
    })
    .strict();

  const bodySchema = z
    .object({
      reason: z.string().trim().min(3).max(250),
      adjustedOn: z
        .string()
        .refine(isValidDateOnly, "Date must be a valid YYYY-MM-DD value")
        .optional(),
      lines: z.array(lineSchema).min(1).max(50),
    })
    .strict()
    .refine(
      (value) =>
        new Set(value.lines.map((line) => line.batchId)).size ===
        value.lines.length,
      {
        message: "Each batch may appear only once per adjustment",
        path: ["lines"],
      },
    );

  const body = await parseJsonBody(request, bodySchema);

  let result;

  try {
    result = await processStockAdjustment({ body, user, idempotencyKey });
  } catch (error) {
    if (error instanceof StockAdjustmentServiceError)
      throw new ApiError(error.status, error.code, error.message);

    throw error;
  }

  return successResponse(result, "Stock adjustment recorded", 201);
}

async function handleGet(request: Request, path: string[], user: User) {
  const [resource, id, nested] = path;

  if (!resource) throw new ApiError(404, "NOT_FOUND", "Resource not found");

  const search = new URL(request.url).searchParams;

  if (resource === "preferences" && path.length === 1)
    return successResponse(
      await getUserPreferences(user.id),
      "Preferences loaded",
    );

  requireGroupPermission(user, resource, "GET");

  if (resource === "dashboard" && path.length === 1) {
    const range = search.get("range") ?? "week";

    if (!["week", "month", "year"].includes(range))
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Unsupported dashboard range",
      );

    return successResponse(
      await getDashboardData(range as DashboardRange, user.id),
      "Dashboard loaded",
    );
  }

  if (resource === "reports" && path.length === 1) {
    const isCsv = search.get("format") === "csv";
    const report = await getReportData(search, user.id, isCsv);

    if (isCsv)
      return new Response(`\uFEFF${reportCsv(report.type, report.items)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="med-easy-${report.type}-${report.from}-${report.to}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });

    return successResponse(report, "Report loaded");
  }

  if (resource === "settings" && path.length === 1)
    return successResponse(await getWorkspaceSettings(), "Settings loaded");

  if (resource === "cash-book") {
    if (id && id !== "summary") {
      const entries =
        await jsonStore.read<Record<string, unknown>[]>("cash-book-entries");

      const entry = entries.find((record) => record.id === id);

      if (!entry)
        throw new ApiError(404, "NOT_FOUND", "Cash-book entry not found");

      return successResponse(entry, "Cash-book entry loaded");
    }

    return successResponse(await listCashBook(search), "Cash book loaded");
  }

  if (resource === "payments" && id === "summary")
    return successResponse(await getPaymentSummary(), "Payment summary loaded");

  if (resource === "expenses" && id === "summary")
    return successResponse(await getExpenseSummary(), "Expense summary loaded");

  if (["purchases", "sales", "quotations"].includes(resource) && id) {
    return successResponse(
      await getTransactionDetail(
        resource as "purchases" | "sales" | "quotations",
        id,
      ),
      "Transaction loaded",
    );
  }

  if (resource === "payments" && id)
    return successResponse(await getPaymentDetail(id), "Payment detail loaded");

  if (resource === "inventory") {
    if (id) return inventoryDetail(id);
    return inventoryList(search);
  }

  if (
    resource === "batches" &&
    id &&
    nested === "movements" &&
    path.length === 3
  ) {
    const batch = await readResource("batches", id);
    const movements = await jsonStore.read<StockMovement[]>("stock-movements");

    return successResponse(
      { batch, items: movements.filter((movement) => movement.batchId === id) },
      "Batch movement history loaded",
    );
  }

  if (!isResourceName(resource))
    throw new ApiError(404, "NOT_FOUND", "Resource not found");

  const resourceName = resource;

  if (id)
    return successResponse(
      await readResource(resourceName, id),
      "Record loaded",
    );

  return successResponse(
    await listResource(resourceName, search),
    "Records loaded",
  );
}

async function handlePost(request: Request, path: string[], user: User) {
  const [resource, id, operation] = path;

  if (!resource) throw new ApiError(404, "NOT_FOUND", "Resource not found");

  requireGroupPermission(user, resource, "POST");

  if (resource === "stock-adjustments" && !id)
    return createStockAdjustmentRequest(request, user);

  if (resource === "purchases") {
    if (!id && path.length === 1)
      return successResponse(
        await createPurchaseDraft(
          purchaseDraftInputSchema.parse(await parseObjectBody(request)),
          user,
          request.headers.get("idempotency-key"),
        ),
        "Purchase draft created",
        201,
      );

    if (id && operation === "receive" && path.length === 3)
      return successResponse(
        await receivePurchase(id, request.headers.get("idempotency-key")),
        "Purchase received",
      );

    if (id && operation === "cancel" && path.length === 3)
      return successResponse(
        await cancelPurchase(id, request.headers.get("idempotency-key")),
        "Purchase cancelled",
      );
  }

  if (resource === "sales") {
    if (!id && path.length === 1)
      return successResponse(
        await createSaleDraft(
          saleDraftInputSchema.parse(await parseObjectBody(request)),
          user,
          request.headers.get("idempotency-key"),
        ),
        "Sale draft created",
        201,
      );

    if (id && operation === "complete" && path.length === 3)
      return successResponse(
        await completeSale(
          id,
          saleCompletionInputSchema.parse(await parseObjectBody(request)),
          user,
          request.headers.get("idempotency-key"),
        ),
        "Sale completed",
      );

    if (id && operation === "cancel" && path.length === 3)
      return successResponse(
        await cancelSale(id, request.headers.get("idempotency-key")),
        "Sale cancelled or reversed",
      );
  }

  if (resource === "quotations") {
    if (!id && path.length === 1)
      return successResponse(
        await createQuotationDraft(
          quotationDraftInputSchema.parse(await parseObjectBody(request)),
          user,
          request.headers.get("idempotency-key"),
        ),
        "Quotation draft created",
        201,
      );

    if (id && operation === "status" && path.length === 3)
      return successResponse(
        await updateQuotationStatus(
          id,
          quotationStatusInputSchema.parse(await parseObjectBody(request))
            .status,
        ),
        "Quotation status updated",
      );

    if (id && operation === "convert-to-sale" && path.length === 3)
      return successResponse(
        await convertQuotation(
          id,
          user,
          request.headers.get("idempotency-key"),
        ),
        "Quotation converted to a draft sale",
        201,
      );
  }

  if (resource === "payments" && !id && path.length === 1)
    return successResponse(
      await recordPayment(
        paymentInputSchema.parse(await parseObjectBody(request)),
        user,
        request.headers.get("idempotency-key"),
      ),
      "Payment recorded",
      201,
    );

  if (resource === "expenses") {
    if (!id && path.length === 1)
      return successResponse(
        await createExpense(
          expenseInputSchema.parse(await parseObjectBody(request)),
          request.headers.get("idempotency-key"),
        ),
        "Expense recorded",
        201,
      );
  }

  if (resource === "cash-book" && !id && path.length === 1)
    return successResponse(
      await createManualCashEntry(
        manualCashEntryInputSchema.parse(await parseObjectBody(request)),
        request.headers.get("idempotency-key"),
      ),
      "Cash-book entry recorded",
      201,
    );

  if (
    resource === "users" &&
    id &&
    operation === "setup-token" &&
    path.length === 3
  ) {
    const setupToken = await jsonAuth.issueAccountSetupToken(id);

    return successResponse(
      { setupToken, expiresInHours: 48 },
      "One-time setup token issued",
    );
  }

  if (id || !isResourceName(resource))
    throw new ApiError(404, "NOT_FOUND", "Resource not found");

  return createResource(resource, request, user);
}

async function handlePatch(request: Request, path: string[], user: User) {
  const [resource, id] = path;

  if (!resource) throw new ApiError(404, "NOT_FOUND", "Resource not found");

  if (resource === "preferences" && !id && path.length === 1) {
    return successResponse(
      await updateUserPreferences(user.id, await parseObjectBody(request)),
      "Preferences updated",
    );
  }

  if (resource === "settings" && id && path.length === 2) {
    requireGroupPermission(user, resource, "PATCH");

    if (!["pharmacy", "tax", "invoice", "inventory"].includes(id))
      throw new ApiError(404, "NOT_FOUND", "Settings section not found");

    return successResponse(
      await updateWorkspaceSettings(
        id as "pharmacy" | "tax" | "invoice" | "inventory",
        await parseObjectBody(request),
      ),
      "Settings updated",
    );
  }

  if (!id) throw new ApiError(404, "NOT_FOUND", "Resource not found");

  requireGroupPermission(user, resource, "PATCH");

  if (path.length === 2 && resource === "purchases")
    return successResponse(
      await updatePurchaseDraft(
        id,
        purchaseDraftInputSchema.parse(await parseObjectBody(request)),
      ),
      "Purchase draft updated",
    );

  if (path.length === 2 && resource === "sales")
    return successResponse(
      await updateSaleDraft(
        id,
        saleDraftInputSchema.parse(await parseObjectBody(request)),
      ),
      "Sale draft updated",
    );

  if (path.length === 2 && resource === "quotations")
    return successResponse(
      await updateQuotationDraft(
        id,
        quotationDraftInputSchema.parse(await parseObjectBody(request)),
      ),
      "Quotation draft updated",
    );

  if (path.length === 2 && resource === "expenses")
    return successResponse(
      await updateExpense(
        id,
        expenseInputSchema.parse(await parseObjectBody(request)),
        request.headers.get("idempotency-key"),
      ),
      "Expense updated",
    );

  if (!isResourceName(resource) || path.length !== 2)
    throw new ApiError(404, "NOT_FOUND", "Resource not found");

  return updateResource(resource, id, request);
}

async function handleDelete(path: string[], user: User) {
  const [resource, id] = path;

  if (!resource || !id || !isResourceName(resource))
    throw new ApiError(404, "NOT_FOUND", "Resource not found");

  requireGroupPermission(user, resource, "DELETE");

  return deactivateResource(resource, id);
}

export async function handleV1(
  request: Request,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  context: V1RouteContext,
) {
  try {
    const user = await requireRequestUser(request);
    const { path } = await context.params;

    if (method === "GET") return await handleGet(request, path, user);
    if (method === "POST") return await handlePost(request, path, user);
    if (method === "PATCH") return await handlePatch(request, path, user);

    return await handleDelete(path, user);
  } catch (error) {
    console.error("[API V1 ERROR]", {
      method,
      url: request.url,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    });
    return errorResponse(error);
  }
}
