"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useSWRConfig } from "swr";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  CirclePlus,
  FileText,
  LoaderCircle,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  Expense,
  InventoryBatch,
  Medicine,
  Patient,
  Payment,
  Purchase,
  Quotation,
  Sale,
  Supplier,
} from "@/lib/domain/types";

type PageSection =
  | "purchases"
  | "sales"
  | "quotations"
  | "payments"
  | "expenses"
  | "cash-book";
type AnyRecord = Record<string, any>;
type Envelope<T> = { data: T; message?: string };
type LineDraft = {
  medicineId: string;
  quantity: number;
  discountPercent: number;
  unitPriceRupees: string;
  batchNumber: string;
  expiryDate: string;
  sellingPriceRupees: string;
  reorderLevel: number;
  batchId: string;
  stripSize: number;
  unitCode: string;
};
type TxDetail = {
  purchase?: Purchase;
  sale?: Sale;
  quotation?: Quotation;
  items: AnyRecord[];
  payments?: Payment[];
};

const surface =
  "rounded-xl border border-[#e7ede9] bg-white shadow-[0_2px_7px_rgba(24,55,42,.025)]";
const primary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#157a62] px-3.5 text-xs font-semibold text-white transition hover:bg-[#116c56] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4bab8a] disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#dfe8e3] bg-white px-3.5 text-xs font-semibold text-[#43524c] transition hover:bg-[#f8faf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4bab8a] disabled:cursor-not-allowed disabled:opacity-50";
const input =
  "h-9 w-full rounded-lg border border-[#e0e8e4] bg-white px-3 text-xs text-[#26352f] outline-none transition placeholder:text-[#a2ada8] focus:border-[#58a98c] focus:ring-2 focus:ring-[#e1f2eb]";
const select = `${input} appearance-none`;
const methods = ["cash", "upi", "card", "bank_transfer"] as const;
const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((paise || 0) / 100);
const rupeesToPaise = (value: string) => Math.round(Number(value || 0) * 100);
const paiseToRupees = (value: number) => (value / 100).toFixed(2);
const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00`))
    : "—";
const titleFor: Record<PageSection, string> = {
  purchases: "Purchases",
  sales: "Sales & billing",
  quotations: "Quotations",
  payments: "Payments",
  expenses: "Expenses",
  "cash-book": "Cash book",
};

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || "Could not load records");
  return json.data;
}
async function send<T>(
  url: string,
  method: string,
  payload: unknown,
  idempotencyKey?: string,
): Promise<Envelope<T>> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  const response = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    const validation = Array.isArray(result.errors)
      ? result.errors
          .map(
            (error: { path?: string; message?: string }) =>
              `${error.path ? `${error.path}: ` : ""}${error.message}`,
          )
          .join(" · ")
      : "";
    throw new Error(
      validation || result.message || "The request could not be completed",
    );
  }
  return result;
}
function newKey(
  previous: { signature: string; key: string } | null,
  payload: unknown,
) {
  const signature = JSON.stringify(payload);
  if (previous?.signature === signature) return previous;
  return { signature, key: crypto.randomUUID() };
}
function useApiRefresh() {
  const { mutate } = useSWRConfig();
  return () =>
    mutate(
      (key) => typeof key === "string" && key.startsWith("/api/v1/"),
      undefined,
      { revalidate: true },
    );
}
function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#218066]">
          Transactions
        </p>
        <h1 className="text-[23px] font-semibold tracking-[-.04em] text-[#1d2e28]">
          {title}
        </h1>
        <p className="mt-1 text-xs text-[#87938e]">{description}</p>
      </div>
      {action}
    </div>
  );
}
function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone =
    normalized.includes("cancel") ||
    normalized.includes("reject") ||
    normalized.includes("reverse") ||
    normalized.includes("expired")
      ? "bg-[#fff0ed] text-[#b84d43]"
      : normalized.includes("draft") ||
          normalized.includes("pending") ||
          normalized.includes("sent") ||
          normalized.includes("partial")
        ? "bg-[#fff6e6] text-[#aa7524]"
        : "bg-[#e9f6ef] text-[#287b5f]";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${tone}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
function Notice({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-4 rounded-lg border px-3 py-2 text-xs ${error ? "border-[#f0d7d3] bg-[#fff5f3] text-[#a4483f]" : "border-[#cfe9dc] bg-[#eff9f3] text-[#27775d]"}`}
    >
      {error || success}
    </div>
  );
}
function Loading({ label = "Loading records…" }: { label?: string }) {
  return (
    <div
      role="status"
      className={`${surface} flex items-center gap-2 p-8 text-xs text-[#84918b]`}
    >
      <LoaderCircle className="animate-spin" size={16} />
      {label}
    </div>
  );
}
function Failure({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[#f0d7d3] bg-white p-5 text-xs text-[#a4483f]"
    >
      <p>{message}</p>
      {retry && (
        <button className={`${secondary} mt-3`} onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`flex flex-col gap-1.5 text-[10px] font-semibold text-[#5d6a64] ${className}`}
    >
      {label}
      {children}
    </label>
  );
}
function Table({
  headings,
  children,
}: {
  headings: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] border-collapse text-left">
        <thead>
          <tr className="border-y border-[#edf1ef] bg-[#fafcfb]">
            {headings.map((heading) => (
              <th
                key={heading}
                className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-[.06em] text-[#84918b]"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TransactionWorkspace({
  section,
  action,
  operation,
}: {
  section: PageSection;
  action?: string;
  operation?: string;
}) {
  const detailUrl =
    action && action !== "new" ? `/api/v1/${section}/${action}` : null;
  const {
    data: detailData,
    error: detailError,
    isLoading: detailLoading,
    mutate: refreshDetail,
  } = useSWR<AnyRecord>(detailUrl, fetcher);
  const listUrl = !action
    ? section === "cash-book"
      ? "/api/v1/cash-book"
      : `/api/v1/${section}?page=1&pageSize=100&sortBy=createdAt&sortOrder=desc`
    : null;
  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: refreshList,
  } = useSWR<AnyRecord>(listUrl, fetcher);
  const { data: suppliers } = useSWR<{ items: Supplier[] }>(
    section === "purchases" || section === "payments"
      ? "/api/v1/suppliers?page=1&pageSize=100"
      : null,
    fetcher,
  );
  // const { data: patients } = useSWR<{ items: Patient[] }>(
  //   section === "sales" || section === "quotations" || section === "payments"
  //     ? "/api/v1/patients?page=1&pageSize=100"
  //     : null,
  //   fetcher,
  // );
  const { data: patients } = useSWR<{ items: Patient[] }>(
    section === "sales"
      ? null // Sales will search patients by phone separately
      : section === "quotations" || section === "payments"
        ? "/api/v1/patients?page=1&pageSize=100"
        : null,
    fetcher,
  );
  const { data: summary } = useSWR<AnyRecord>(
    section === "payments"
      ? "/api/v1/payments/summary"
      : section === "expenses"
        ? "/api/v1/expenses/summary"
        : null,
    fetcher,
  );
  const refreshApi = useApiRefresh();
  const router = useRouter();

  if (action === "new") {
    if (section === "payments") return <PaymentEditor />;
    if (section === "expenses") return <ExpenseEditor />;
    if (section === "cash-book") return <CashEntryEditor />;
    return <TransactionEditor section={section} />;
  }
  if (
    operation === "edit" &&
    (section === "purchases" || section === "sales" || section === "quotations")
  ) {
    if (detailLoading) return <Loading label="Loading draft…" />;
    if (detailError || !detailData)
      return (
        <Failure
          message={detailError?.message ?? "Draft not found"}
          retry={() => refreshDetail()}
        />
      );
    if (section === "purchases")
      return (
        <TransactionEditor
          section={section}
          initial={detailData.purchase}
          initialItems={detailData.items}
        />
      );
    if (section === "sales")
      return (
        <TransactionEditor
          section={section}
          initial={detailData.sale}
          initialItems={detailData.items}
        />
      );
    return (
      <TransactionEditor
        section={section}
        initial={detailData.quotation}
        initialItems={detailData.items}
      />
    );
  }
  if (operation === "edit" && section === "expenses") {
    if (detailLoading) return <Loading label="Loading expense…" />;
    if (detailError || !detailData)
      return (
        <Failure
          message={detailError?.message ?? "Expense not found"}
          retry={() => refreshDetail()}
        />
      );
    return <ExpenseEditor initial={detailData as Expense} />;
  }
  if (action) {
    if (detailLoading) return <Loading label="Loading transaction…" />;
    if (detailError || !detailData)
      return (
        <Failure
          message={detailError?.message ?? "Transaction not found"}
          retry={() => refreshDetail()}
        />
      );
    return (
      <TransactionDetail
        section={section}
        data={detailData}
        onChanged={async (next) => {
          await refreshApi();
          await refreshDetail();
          if (next) router.push(next);
        }}
      />
    );
  }
  if (listLoading) return <Loading />;
  if (listError || !listData)
    return (
      <Failure
        message={listError?.message ?? "Could not load this section"}
        retry={() => refreshList()}
      />
    );
  return (
    <TransactionList
      section={section}
      data={listData}
      summary={summary}
      suppliers={suppliers?.items ?? []}
      patients={patients?.items ?? []}
    />
  );
}

function TransactionList({
  section,
  data,
  summary,
  suppliers,
  patients,
}: {
  section: PageSection;
  data: AnyRecord;
  summary?: AnyRecord;
  suppliers: Supplier[];
  patients: Patient[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const title = titleFor[section];
  const rows: AnyRecord[] = data.items ?? [];
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const term = query.trim().toLocaleLowerCase("en-IN");
        const matches =
          !term ||
          Object.values(row).some((value) =>
            String(value ?? "")
              .toLocaleLowerCase("en-IN")
              .includes(term),
          );
        return (
          matches &&
          (filter === "all" ||
            String(row.status ?? row.entryType ?? "").toLowerCase() === filter)
        );
      }),
    [rows, query, filter],
  );
  const filterOptions =
    section === "cash-book"
      ? ["inflow", "outflow"]
      : section === "quotations"
        ? ["draft", "sent", "accepted", "rejected", "expired", "converted"]
        : section === "purchases"
          ? ["draft", "received", "cancelled"]
          : section === "sales"
            ? ["draft", "completed", "partially_paid", "cancelled", "reversed"]
            : [];
  const href = section === "cash-book" ? "/cash-book/new" : `/${section}/new`;
  const actionLabel =
    section === "sales"
      ? "New sale"
      : section === "purchases"
        ? "New purchase"
        : section === "quotations"
          ? "New quotation"
          : section === "payments"
            ? "Record payment"
            : section === "expenses"
              ? "Add expense"
              : "Add cash entry";
  const summaryCards =
    section === "payments"
      ? [
          [
            "Received this month",
            money(summary?.receivedPaise ?? 0),
            ArrowDownRight,
          ],
          ["Paid to suppliers", money(summary?.paidPaise ?? 0), ArrowUpRight],
          [
            "Payment records",
            String(summary?.paymentCount ?? rows.length),
            FileText,
          ],
        ]
      : section === "expenses"
        ? [
            [
              "Expenses this month",
              money(summary?.totalPaise ?? 0),
              ArrowUpRight,
            ],
            [
              "Recorded entries",
              String(summary?.count ?? rows.length),
              FileText,
            ],
            [
              "Categories used",
              String(Object.keys(summary?.categoryTotalsPaise ?? {}).length),
              Check,
            ],
          ]
        : section === "cash-book"
          ? [
              [
                "Cash received",
                money(data.summary?.inflowPaise ?? 0),
                ArrowDownRight,
              ],
              [
                "Cash paid",
                money(data.summary?.outflowPaise ?? 0),
                ArrowUpRight,
              ],
              [
                "Closing balance",
                money(data.summary?.closingBalancePaise ?? 0),
                Check,
              ],
            ]
          : [];
  return (
    <>
      <PageHeading
        title={title}
        description={
          section === "cash-book"
            ? "Review receipts, payments, expenses, and manual cash adjustments."
            : `Manage ${title.toLocaleLowerCase("en-IN")} using recorded transaction history.`
        }
        action={
          <Link className={primary} href={href}>
            <Plus size={15} />
            {actionLabel}
          </Link>
        }
      />
      {summaryCards.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {summaryCards.map(([label, value, Icon]) => {
            const StatIcon = Icon as typeof Check;
            return (
              <section key={label as string} className={`${surface} p-4`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-[#81908a]">
                      {label as string}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[#26352f]">
                      {value as string}
                    </p>
                  </div>
                  <span className="rounded-xl bg-[#e9f5ef] p-2 text-[#218064]">
                    <StatIcon size={16} />
                  </span>
                </div>
              </section>
            );
          })}
        </div>
      )}
      <section className={surface}>
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-[#e4ebe7] px-3">
            <Search size={15} className="text-[#95a19b]" />
            <input
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${title.toLocaleLowerCase("en-IN")}…`}
            />
          </label>
          <select
            className={`${select} w-auto min-w-[150px]`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filter records by status"
          >
            <option value="all">All records</option>
            {filterOptions.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        {visible.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-semibold text-[#43524c]">
              No matching records
            </p>
            <p className="mt-1 text-xs text-[#95a19c]">
              New records will appear here after they are saved.
            </p>
          </div>
        ) : (
          <Table headings={columnsFor(section)}>
            <>
              {visible.map((row) => (
                <TransactionRow
                  key={row.id}
                  section={section}
                  row={row}
                  suppliers={suppliers}
                  patients={patients}
                />
              ))}
            </>
          </Table>
        )}
        <div className="border-t border-[#edf1ef] px-4 py-3 text-[10px] text-[#8d9993]">
          {visible.length} of {rows.length} records · Monetary values are stored
          in paise.
        </div>
      </section>
    </>
  );
}
function columnsFor(section: PageSection) {
  if (section === "purchases")
    return [
      "Purchase no.",
      "Supplier",
      "Date",
      "Total",
      "Paid",
      "Outstanding",
      "Status",
    ];
  if (section === "sales")
    return [
      "Invoice",
      "Customer",
      "Date",
      "Total",
      "Paid",
      "Outstanding",
      "Status",
    ];
  if (section === "quotations")
    return [
      "Quotation no.",
      "Customer",
      "Issued",
      "Valid until",
      "Total",
      "Status",
    ];
  if (section === "payments")
    return [
      "Date",
      "Direction",
      "Party",
      "Invoice",
      "Method",
      "Amount",
      "Reference",
    ];
  if (section === "expenses")
    return ["Date", "Category", "Description", "Method", "Amount", "Reference"];
  return [
    "Date",
    "Type",
    "Description",
    "Reference",
    "Debit",
    "Credit",
    "Balance",
  ];
}
function TransactionRow({
  section,
  row,
  suppliers,
  patients,
}: {
  section: PageSection;
  row: AnyRecord;
  suppliers: Supplier[];
  patients: Patient[];
}) {
  const recordUrl = `/${section}/${row.id}`;
  const supplier =
    suppliers.find((entry) => entry.id === row.supplierId)?.name ??
    row.supplierId;
  const patient =
    patients.find((entry) => entry.id === row.patientId)?.name ??
    (row.patientId ? row.patientId : "Walk-in customer");
  const party =
    row.partyType === "supplier"
      ? suppliers.find((entry) => entry.id === row.partyId)?.name
      : patients.find((entry) => entry.id === row.partyId)?.name;
  return (
    <tr className="border-b border-[#f0f3f1] last:border-0 hover:bg-[#fcfdfc]">
      {section === "purchases" && (
        <>
          <td className="px-4 py-3 text-[11px] font-semibold text-[#18765e]">
            <Link href={recordUrl}>{row.invoiceNumber}</Link>
          </td>
          <td className="px-4 py-3 text-[11px] text-[#68766f]">{supplier}</td>
          <td className="px-4 py-3 text-[11px] text-[#68766f]">
            {dateLabel(row.purchasedOn)}
          </td>
          <td className="px-4 py-3 text-[11px] font-semibold">
            {money(row.totalPaise)}
          </td>
          <td className="px-4 py-3 text-[11px]">{money(row.paidPaise)}</td>
          <td className="px-4 py-3 text-[11px]">
            {money(row.totalPaise - row.paidPaise)}
          </td>
          <td className="px-4 py-3">
            <Status value={row.status} />
          </td>
        </>
      )}
      {section === "sales" && (
        <>
          <td className="px-4 py-3 text-[11px] font-semibold text-[#18765e]">
            <Link href={recordUrl}>{row.invoiceNumber}</Link>
          </td>
          <td className="px-4 py-3 text-[11px] text-[#68766f]">{patient}</td>
          <td className="px-4 py-3 text-[11px] text-[#68766f]">
            {dateLabel(row.soldOn)}
          </td>
          <td className="px-4 py-3 text-[11px] font-semibold">
            {money(row.totalPaise)}
          </td>
          <td className="px-4 py-3 text-[11px]">{money(row.paidPaise)}</td>
          <td className="px-4 py-3 text-[11px]">
            {money(row.totalPaise - row.paidPaise)}
          </td>
          <td className="px-4 py-3">
            <Status value={row.status} />
          </td>
        </>
      )}
      {section === "quotations" && (
        <>
          <td className="px-4 py-3 text-[11px] font-semibold text-[#18765e]">
            <Link href={recordUrl}>{row.quotationNumber}</Link>
          </td>
          <td className="px-4 py-3 text-[11px] text-[#68766f]">{patient}</td>
          <td className="px-4 py-3 text-[11px]">{dateLabel(row.issuedOn)}</td>
          <td className="px-4 py-3 text-[11px]">{dateLabel(row.validUntil)}</td>
          <td className="px-4 py-3 text-[11px] font-semibold">
            {money(row.totalPaise)}
          </td>
          <td className="px-4 py-3">
            <Status value={row.status} />
          </td>
        </>
      )}
      {section === "payments" && (
        <>
          <td className="px-4 py-3 text-[11px]">
            <Link href={recordUrl}>{dateLabel(row.paidOn)}</Link>
          </td>
          <td className="px-4 py-3 text-[11px] capitalize">{row.direction}</td>
          <td className="px-4 py-3 text-[11px]">
            {party ?? "Walk-in customer"}
          </td>
          <td className="px-4 py-3 text-[11px]">
            <Link
              className="text-[#18765e]"
              href={`/${row.transactionType === "sale" ? "sales" : "purchases"}/${row.transactionId}`}
            >
              {row.transactionId}
            </Link>
          </td>
          <td className="px-4 py-3 text-[11px] capitalize">
            {String(row.method).replaceAll("_", " ")}
          </td>
          <td className="px-4 py-3 text-[11px] font-semibold">
            {money(row.amountPaise)}
          </td>
          <td className="px-4 py-3 text-[11px]">{row.reference || "—"}</td>
        </>
      )}
      {section === "expenses" && (
        <>
          <td className="px-4 py-3 text-[11px]">{dateLabel(row.incurredOn)}</td>
          <td className="px-4 py-3 text-[11px] capitalize">{row.category}</td>
          <td className="px-4 py-3 text-[11px]">
            <Link className="font-semibold text-[#18765e]" href={recordUrl}>
              {row.description}
            </Link>
          </td>
          <td className="px-4 py-3 text-[11px] capitalize">
            {String(row.method).replaceAll("_", " ")}
          </td>
          <td className="px-4 py-3 text-[11px] font-semibold">
            {money(row.amountPaise)}
          </td>
          <td className="px-4 py-3 text-[11px]">{row.reference || "—"}</td>
        </>
      )}
      {section === "cash-book" && (
        <>
          <td className="px-4 py-3 text-[11px]">{dateLabel(row.occurredOn)}</td>
          <td className="px-4 py-3 text-[11px]">
            <Status value={row.entryType} />
          </td>
          <td className="px-4 py-3 text-[11px]">
            <Link className="text-[#18765e]" href={recordUrl}>
              {row.description}
            </Link>
          </td>
          <td className="px-4 py-3 text-[11px]">
            {row.reference ?? row.paymentId ?? row.expenseId ?? "—"}
          </td>
          <td className="px-4 py-3 text-[11px]">
            {row.entryType === "outflow" ? money(row.amountPaise) : "—"}
          </td>
          <td className="px-4 py-3 text-[11px]">
            {row.entryType === "inflow" ? money(row.amountPaise) : "—"}
          </td>
          <td className="px-4 py-3 text-[11px] font-semibold">
            {money(row.runningBalancePaise)}
          </td>
        </>
      )}
    </tr>
  );
}

function TransactionEditor({
  section,
  initial,
  initialItems,
}: {
  section: "purchases" | "sales" | "quotations";
  initial?: AnyRecord;
  initialItems?: AnyRecord[];
}) {
  const router = useRouter();
  const refresh = useApiRefresh();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [customerId, setCustomerId] = useState(initial?.patientId ?? "");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [searchedPhone, setSearchedPhone] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerCity, setNewCustomerCity] = useState("");
  const [newCustomerState, setNewCustomerState] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [doctorId, setDoctorId] = useState(initial?.doctorId ?? "");
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [date, setDate] = useState(
    initial?.purchasedOn ?? initial?.soldOn ?? initial?.issuedOn ?? today(),
  );
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? today());
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState(
    initial?.supplierInvoiceNumber ?? "",
  );
  // const [lines, setLines] = useState<LineDraft[]>(() =>
  //   initialItems?.length
  //     ? initialItems.map((item) => ({
  //         medicineId: item.medicineId,
  //         quantity: item.quantity,
  //         discountRupees: paiseToRupees(item.discountPaise),
  //         unitPriceRupees: paiseToRupees(item.unitPricePaise),
  //         batchNumber: item.batchNumber ?? "",
  //         expiryDate: item.expiryDate ?? "",
  //         sellingPriceRupees: paiseToRupees(item.sellingPricePaise ?? 0),
  //         reorderLevel: item.reorderLevel ?? 0,
  //         batchId: item.batchId ?? "",
  //         stripSize: item.stripSize,
  //         unitCode: item.unit
  //       }))
  //     : [
  //         {
  //           medicineId: "",
  //           quantity: 1,
  //           discountRupees: "0.00",
  //           unitPriceRupees: "0.00",
  //           batchNumber: "",
  //           expiryDate: "",
  //           sellingPriceRupees: "0.00",
  //           reorderLevel: 0,
  //           batchId: "",
  //         },
  //       ],
  // );
  const [lines, setLines] = useState<LineDraft[]>(() =>
    initialItems?.length
      ? initialItems.map((item) => {
          const medicine = medicines?.items.find(
            (medicine) => medicine.id === item.medicineId,
          );

          return {
            medicineId: item.medicineId,
            quantity: item.quantity,
            discountPercent: 0,
            unitPriceRupees: paiseToRupees((item.unitPricePaise/100)),
            batchNumber: item.batchNumber ?? "",
            expiryDate: item.expiryDate ?? "",
            sellingPriceRupees: paiseToRupees((item.sellingPricePaise ?? 0)/100),
            reorderLevel: item.reorderLevel ?? 0,
            batchId: item.batchId ?? "",
            stripSize: medicine?.stripSize ?? 1,
            unitCode: medicine?.unitId ?? "",
          };
        })
      : [
          {
            medicineId: "",
            quantity: 1,
            discountPercent: 0,
            unitPriceRupees: "0.00",
            batchNumber: "",
            expiryDate: "",
            sellingPriceRupees: "0.00",
            reorderLevel: 0,
            batchId: "",
            stripSize: 1,
            unitCode: "",
          },
        ],
  );
  const [search, setSearch] = useState("");
  const pendingRef = useRef<{ signature: string; key: string } | null>(null);
  const { data: medicines } = useSWR<{ items: Medicine[] }>(
    "/api/v1/medicines?page=1&pageSize=100&sortBy=name&sortOrder=asc",
    fetcher,
  );
  const { data: suppliers } = useSWR<{ items: Supplier[] }>(
    section === "purchases"
      ? "/api/v1/suppliers?page=1&pageSize=100&sortBy=name"
      : null,
    fetcher,
  );
  // const { data: patients } = useSWR<{ items: Patient[] }>(
  //   section !== "purchases"
  //     ? "/api/v1/patients?page=1&pageSize=100&sortBy=name"
  //     : null,
  //   fetcher,
  // );
  const patientUrl =
    section === "sales" && customerPhone.trim()
      ? `/api/v1/patients?phone=${encodeURIComponent(customerPhone.trim())}`
      : section === "quotations"
        ? "/api/v1/patients?page=1&pageSize=100&sortBy=name"
        : null;

  const { data: patients, isLoading: patientsLoading } = useSWR<{
    items: Patient[];
  }>(patientUrl, fetcher);

  // const { data: patients } = useSWR<{ items: Patient[] }>(patientUrl, fetcher);
  const { data: doctors } = useSWR<{ items: AnyRecord[] }>(
    section === "sales"
      ? "/api/v1/doctors?page=1&pageSize=100&sortBy=name"
      : null,
    fetcher,
  );
  const { data: inventory } = useSWR<{ items: AnyRecord[] }>(
    section === "sales"
      ? "/api/v1/inventory?view=current&page=1&pageSize=100&sortBy=expiryDate&sortOrder=asc"
      : null,
    fetcher,
  );
  const productById = useMemo(
    () =>
      new Map(
        (medicines?.items ?? []).map((medicine) => [medicine.id, medicine]),
      ),
    [medicines],
  );
  const isPurchase = section === "purchases";
  const isSale = section === "sales";
  const title = initial
    ? `Edit ${isPurchase ? "purchase" : isSale ? "sale" : "quotation"} draft`
    : `New ${isPurchase ? "purchase" : isSale ? "sale" : "quotation"}`;
  const normalizePhone = (value: string) => {
    let digits = value.replace(/\D/g, "");

    // Convert +91XXXXXXXXXX or 91XXXXXXXXXX to a 10-digit number.
    if (digits.length === 12 && digits.startsWith("91")) {
      digits = digits.slice(2);
    }

    // Convert 0XXXXXXXXXX to a 10-digit number.
    if (digits.length === 11 && digits.startsWith("0")) {
      digits = digits.slice(1);
    }

    return digits;
  };
  const isValidIndianMobile = (value: string) =>
    /^[6-9]\d{9}$/.test(normalizePhone(value));
  // const matchingCustomers = useMemo(() => {
  const matchingCustomers = useMemo(() => {
    const phone = normalizePhone(customerPhone);

    if (!phone) return [];

    return (patients?.items ?? [])
      .filter(
        (patient) =>
          patient.status === "active" &&
          normalizePhone(patient.phone).includes(phone),
      )
      .slice(0, 5);
  }, [patients, customerPhone]);
  //   if (!phone || phone.length < 4) return [];

  //   return (patients?.items ?? [])
  //     .filter(
  //       (patient) =>
  //         patient.status === "active" &&
  //         normalizePhone(patient.phone).includes(phone),
  //     )
  //     .slice(0, 5);
  // }, [patients, customerPhone]);

  // const selectedCustomer = (patients?.items ?? []).find(
  //   (patient) => patient.id === customerId,
  // );
  // const addLine = (medicineId: string) => {
  //   const medicine = productById.get(medicineId);
  //   if (!medicine) return;
  //   setLines((current) => [
  //     ...current,
  //     {
  //       medicineId,
  //       quantity: medicine.unitId === "STR" ? medicine.stripSize : 1,
  //       discountRupees: "0.00",
  //       unitPriceRupees: paiseToRupees(
  //         isPurchase ? medicine.purchasePricePaise : medicine.sellingPricePaise,
  //       ),
  //       sellingPriceRupees: paiseToRupees(medicine.sellingPricePaise),
  //       reorderLevel: medicine.reorderLevel,
  //       batchNumber: "",
  //       expiryDate: "",
  //       batchId: "",
  //     },
  //   ]);
  //   setSearch("");
  // };
  // const changeLine = (index: number, change: Partial<LineDraft>) =>
  //   setLines((current) =>
  //     current.map((line, lineIndex) =>
  //       lineIndex === index ? { ...line, ...change } : line,
  //     ),
  //   );

  const selectedCustomer = (patients?.items ?? []).find(
    (patient) => patient.id === customerId,
  );

  const addLine = (medicineId: string) => {
    const medicine = productById.get(medicineId);
    if (!medicine) return;

    const isStrip = medicine.unitId === "uni_001";
    const stripSize = isStrip ? medicine.stripSize : 1;

    setLines((current) => [
      ...current,
      {
        medicineId,
        quantity: stripSize,
        discountPercent: 0,
        stripSize,
        unitCode: isStrip ? "STR" : "",
        unitPriceRupees: paiseToRupees(
          isPurchase ? medicine.purchasePricePaise : medicine.sellingPricePaise,
        ),
        sellingPriceRupees: paiseToRupees(medicine.sellingPricePaise),
        reorderLevel: medicine.reorderLevel,
        batchNumber: "",
        expiryDate: "",
        batchId: "",
      },
    ]);

    setSearch("");
  };

  const changeLine = (index: number, change: Partial<LineDraft>) =>
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...change } : line,
      ),
    );

  const makePayload = () => {
    const normalizedLines = lines.map((line) => ({
      medicineId: line.medicineId,
      quantity: Number(line.quantity),
      discountPaise: Math.round(
        (Number(line.quantity) *
          rupeesToPaise(line.unitPriceRupees ?? "0") *
          Number(line.discountPercent)) /
          100,
      ),
      ...(isPurchase
        ? {
            unitPricePaise: rupeesToPaise(line.unitPriceRupees ?? "0"),
            batchNumber: line.batchNumber?.trim(),
            expiryDate: line.expiryDate,
            sellingPricePaise: rupeesToPaise(line.sellingPriceRupees ?? "0"),
            reorderLevel: Number(line.reorderLevel ?? 0),
          }
        : isSale && line.batchId
          ? { batchId: line.batchId }
          : {}),
    }));
    if (isPurchase)
      return {
        supplierId,
        purchasedOn: date,
        supplierInvoiceNumber: supplierInvoiceNumber.trim() || undefined,
        lines: normalizedLines,
      };
    if (isSale)
      return {
        patientId: customerId || null,
        doctorId: doctorId || null,
        soldOn: date,
        settlementMethod: "credit" as const,
        lines: normalizedLines,
      };
    return {
      patientId: customerId || null,
      issuedOn: date,
      validUntil,
      lines: normalizedLines,
    };
  };
  // const createNewCustomer = async () => {
  //   if (!newCustomerName.trim()) {
  //     setError("Enter the customer's name.");
  //     return;
  //   }

  //   if (!isValidIndianMobile(customerPhone)) {
  //     setError("Enter a valid 10-digit Indian mobile number.");
  //     return;
  //   }

  //   if (!newCustomerEmail.trim()) {
  //     setError("Enter the customer's email address.");
  //     return;
  //   }

  //   if (!newCustomerCity.trim()) {
  //     setError("Enter the customer's city.");
  //     return;
  //   }

  //   setCreatingCustomer(true);
  //   setError("");

  //   try {
  //     const response = await send<Patient>("/api/v1/patients", "POST", {
  //       name: newCustomerName.trim(),
  //       phone: normalizePhone(customerPhone),
  //       email: newCustomerEmail.trim(),
  //       address: newCustomerAddress.trim(),
  //       city: newCustomerCity.trim(),
  //       state: newCustomerState.trim() || undefined,
  //       dateOfBirth: null,
  //       status: "active",
  //     });

  //     const customer = response.data;

  //     setCustomerId(customer.id);
  //     setCustomerPhone(customer.phone);
  //     setShowNewCustomerForm(false);
  //     setShowCustomerSuggestions(false);

  //     setNewCustomerName("");
  //     setNewCustomerEmail("");
  //     setNewCustomerAddress("");
  //     setNewCustomerCity("");
  //     setNewCustomerState("");

  //     await refresh();
  //   } catch (requestError) {
  //     setError(
  //       requestError instanceof Error
  //         ? requestError.message
  //         : "Could not create customer.",
  //     );
  //   } finally {
  //     setCreatingCustomer(false);
  //   }
  // };
  const createNewCustomer = async () => {
    if (!newCustomerName.trim()) {
      setError("Enter the customer's name.");
      return;
    }

    if (!isValidIndianMobile(customerPhone)) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }

    if (!newCustomerAddress.trim()) {
      setError("Enter the customer's address.");
      return;
    }

    setCreatingCustomer(true);
    setError("");

    try {
      const response = await send<Patient>("/api/v1/patients", "POST", {
        name: newCustomerName.trim(),
        phone: normalizePhone(customerPhone),
        email: newCustomerEmail.trim() || undefined,
        address: newCustomerAddress.trim(),
        city: newCustomerCity.trim() || undefined,
        state: newCustomerState.trim() || undefined,
        dateOfBirth: null,
        status: "active",
      });

      const customer = response.data;

      setCustomerId(customer.id);
      setCustomerPhone(customer.phone);
      setShowNewCustomerForm(false);
      setShowCustomerSuggestions(false);

      setNewCustomerName("");
      setNewCustomerEmail("");
      setNewCustomerAddress("");
      setNewCustomerCity("");
      setNewCustomerState("");

      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not create customer.",
      );
    } finally {
      setCreatingCustomer(false);
    }
  };
  // const submit = async (event: React.FormEvent<HTMLFormElement>) => {
  //   event.preventDefault();
  //   setPending(true);
  //   setError("");
  //   const payload = makePayload();
  //   try {
  //     const keyState = newKey(pendingRef.current, payload);
  //     pendingRef.current = keyState;
  //     const url = initial
  //       ? `/api/v1/${section}/${initial.id}`
  //       : `/api/v1/${section}`;
  //     const response = await send<TxDetail>(
  //       url,
  //       initial ? "PATCH" : "POST",
  //       payload,
  //       initial ? undefined : keyState.key,
  //     );
  //     await refresh();
  //     const record =
  //       section === "purchases"
  //         ? response.data.purchase
  //         : section === "sales"
  //           ? response.data.sale
  //           : response.data.quotation;
  //     router.push(`/${section}/${record?.id ?? initial?.id}`);
  //     router.refresh();
  //   } catch (requestError) {
  //     setError(
  //       requestError instanceof Error
  //         ? requestError.message
  //         : "Could not save this draft",
  //     );
  //   } finally {
  //     setPending(false);
  //   }
  // };
  const runningTotal = lines.reduce((sum, line) => {
    const medicine = productById.get(line.medicineId);
    if (!medicine) return sum;

    const unitPricePaise = isPurchase
      ? rupeesToPaise(line.unitPriceRupees ?? "0")
      : line.unitCode === "STR"
        ? Math.round(medicine.sellingPricePaise / line.stripSize)
        : medicine.sellingPricePaise;

    const subtotalPaise = Number(line.quantity) * unitPricePaise;

    const discountPaise = Math.round(
      (subtotalPaise * Number(line.discountPercent)) / 100,
    );

    return sum + Math.max(0, subtotalPaise - discountPaise);
  }, 0);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    // Validate customer before creating a new sale
    if (isSale && !initial) {
      if (!isValidIndianMobile(customerPhone)) {
        setError("Enter a valid 10-digit Indian mobile number.");
        return;
      }

      if (!customerId) {
        setError(
          "No registered customer found. Please create the customer first.",
        );
        return;
      }
    }

    setPending(true);

    const payload = makePayload();

    try {
      const keyState = newKey(pendingRef.current, payload);
      pendingRef.current = keyState;

      const url = initial
        ? `/api/v1/${section}/${initial.id}`
        : `/api/v1/${section}`;

      const response = await send<TxDetail>(
        url,
        initial ? "PATCH" : "POST",
        payload,
        initial ? undefined : keyState.key,
      );

      await refresh();

      const record =
        section === "purchases"
          ? response.data.purchase
          : section === "sales"
            ? response.data.sale
            : response.data.quotation;

      router.push(`/${section}/${record?.id ?? initial?.id}`);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save this draft",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <PageHeading
        title={title}
        description={
          isPurchase
            ? "Drafts do not change inventory. Receiving is a separate audited action."
            : isSale
              ? "Save a draft now; stock is deducted only when the sale is completed."
              : "Quotes never reserve stock or record payments."
        }
        action={
          <Link
            className={secondary}
            href={initial ? `/${section}/${initial.id}` : `/${section}`}
          >
            <X size={14} /> Cancel
          </Link>
        }
      />
      <Notice error={error} />
      {
        // !medicines ||
        // (isPurchase && !suppliers) ||
        // (!isPurchase && !patients)
        !medicines ||
        (isPurchase && !suppliers) ||
        (section === "quotations" && !patients) ? (
          <Loading label="Loading catalog and account lists…" />
        ) : (
          <form
            onSubmit={submit}
            className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"
          >
            <div className="flex flex-col gap-4">
              <section className={`${surface} p-4 md:p-5`}>
                <h2 className="text-[13px] font-semibold text-[#26352f]">
                  Document details
                </h2>
                <p className="mt-1 text-[10px] text-[#95a09c]">
                  Invoice numbers and calculations are generated by the server.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {isPurchase ? (
                    <>
                      <Field label="Supplier">
                        <select
                          required
                          className={select}
                          value={supplierId}
                          onChange={(event) =>
                            setSupplierId(event.target.value)
                          }
                        >
                          <option value="">Select supplier</option>
                          {suppliers?.items
                            .filter((item) => item.status === "active")
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Supplier invoice number">
                        <input
                          className={input}
                          value={supplierInvoiceNumber}
                          onChange={(event) =>
                            setSupplierInvoiceNumber(event.target.value)
                          }
                          placeholder="Optional external reference"
                        />
                      </Field>
                      <Field label="Purchase date">
                        <input
                          required
                          type="date"
                          className={input}
                          value={date}
                          // readOnly={action === 'new'}
                          onChange={(event) => setDate(event.target.value)}
                        />
                      </Field>
                    </>
                  ) : (
                    <>
                      {/* <Field label="Customer">
                      <select
                        className={select}
                        value={customerId}
                        onChange={(event) => setCustomerId(event.target.value)}
                      >
                        <option value="">Walk-in customer</option>
                        {patients?.items
                          .filter((item) => item.status === "active")
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} · {item.phone}
                            </option>
                          ))}
                      </select>
                    </Field> */}
                      {isSale && !initial ? (
                        <Field label="Customer phone number">
                          <div className="relative">
                            <input
                              type="tel"
                              className={input}
                              value={customerPhone}
                              placeholder="Enter customer phone number"
                              // onChange={(event) => {
                              //   setCustomerPhone(event.target.value);
                              //   setCustomerId("");
                              //   setSearchedPhone(event.target.value);
                              //   setShowCustomerSuggestions(true);
                              // }}
                              onChange={(event) => {
                                const value = event.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 10);

                                setCustomerPhone(value);
                                setCustomerId("");
                                setShowCustomerSuggestions(true);
                              }}
                              onFocus={() => setShowCustomerSuggestions(true)}
                              onBlur={() => {
                                // Allow a suggestion click to register before closing.
                                window.setTimeout(
                                  () => setShowCustomerSuggestions(false),
                                  150,
                                );
                              }}
                            />

                            {showCustomerSuggestions &&
                              customerPhone.trim() && (
                                <div className="absolute left-0 right-0 top-10 z-20 overflow-hidden rounded-lg border border-[#e7ede9] bg-white shadow-lg">
                                  {matchingCustomers.length > 0 ? (
                                    <>
                                      <p className="border-b border-[#edf1ef] px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-[#929d98]">
                                        Existing customers
                                      </p>

                                      {matchingCustomers.map((patient) => (
                                        <button
                                          key={patient.id}
                                          type="button"
                                          className="block w-full px-3 py-2.5 text-left hover:bg-[#eff8f3]"
                                          onMouseDown={(event) =>
                                            event.preventDefault()
                                          }
                                          onClick={() => {
                                            setCustomerId(patient.id);
                                            setCustomerPhone(patient.phone);
                                            setShowCustomerSuggestions(false);
                                          }}
                                        >
                                          <span className="block text-xs font-semibold text-[#35443d]">
                                            {patient.name}
                                          </span>
                                          <span className="mt-0.5 block text-[10px] text-[#84918b]">
                                            {patient.phone}
                                          </span>
                                        </button>
                                      ))}
                                    </>
                                  ) : (
                                    // ) : (
                                    //   <div className="px-3 py-3">
                                    //     <p className="text-xs font-semibold text-[#35443d]">
                                    //       New customer
                                    //     </p>
                                    //     <p className="mt-1 text-[10px] text-[#84918b]">
                                    //       No existing customer found with this phone
                                    //       number.
                                    //     </p>
                                    //   </div>
                                    // )}
                                    <div className="px-3 py-3">
                                      <p className="text-xs font-semibold text-[#35443d]">
                                        No existing customer found
                                      </p>

                                      <p className="mt-1 text-[10px] text-[#84918b]">
                                        Create a new customer using this phone
                                        number.
                                      </p>

                                      {isValidIndianMobile(customerPhone) && (
                                        <button
                                          type="button"
                                          onMouseDown={(event) =>
                                            event.preventDefault()
                                          }
                                          onClick={() => {
                                            setShowCustomerSuggestions(false);
                                            setShowNewCustomerForm(true);
                                          }}
                                          className="mt-3 w-full rounded-lg bg-[#218066] px-3 py-2 text-xs font-semibold text-white hover:bg-[#176b54]"
                                        >
                                          + Create New Customer
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>

                          {selectedCustomer && (
                            <p className="text-[10px] text-[#218066]">
                              <Check size={12} className="mr-1 inline" />
                              Linked to {selectedCustomer.name}
                            </p>
                          )}
                        </Field>
                      ) : (
                        <Field label="Customer">
                          <select
                            className={select}
                            value={customerId}
                            onChange={(event) =>
                              setCustomerId(event.target.value)
                            }
                          >
                            <option value="">Walk-in customer</option>
                            {patients?.items
                              .filter((item) => item.status === "active")
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} · {item.phone}
                                </option>
                              ))}
                          </select>
                        </Field>
                      )}
                      {showNewCustomerForm && (
                        <div className="mt-3 rounded-xl border border-[#dcebe3] bg-[#f7fbf8] p-4 sm:col-span-2">
                          <div className="mb-3">
                            <h3 className="text-sm font-semibold text-[#26352f]">
                              Create New Customer
                            </h3>
                            <p className="mt-1 text-[10px] text-[#84918b]">
                              The customer will be saved to your customer
                              records.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="Customer name*">
                              <input
                                required
                                className={input}
                                value={newCustomerName}
                                onChange={(event) =>
                                  setNewCustomerName(event.target.value)
                                }
                                placeholder="Enter customer name"
                              />
                            </Field>

                            <Field label="Mobile number*">
                              <input
                                className={input}
                                value={normalizePhone(customerPhone)}
                                readOnly
                              />
                            </Field>
                            <Field label="Address*">
                              <input
                                className={input}
                                value={newCustomerAddress}
                                onChange={(event) =>
                                  setNewCustomerAddress(event.target.value)
                                }
                                placeholder="Enter address"
                              />
                            </Field>

                            <Field label="Email address">
                              <input
                                required
                                type="email"
                                className={input}
                                value={newCustomerEmail}
                                onChange={(event) =>
                                  setNewCustomerEmail(event.target.value)
                                }
                                placeholder="customer@example.com"
                              />
                            </Field>

                            <Field label="City">
                              <input
                                required
                                className={input}
                                value={newCustomerCity}
                                onChange={(event) =>
                                  setNewCustomerCity(event.target.value)
                                }
                                placeholder="Enter city"
                              />
                            </Field>

                            <Field label="State">
                              <input
                                className={input}
                                value={newCustomerState}
                                onChange={(event) =>
                                  setNewCustomerState(event.target.value)
                                }
                                placeholder="Enter state"
                              />
                            </Field>
                          </div>

                          <div className="mt-4 flex gap-2">
                            <button
                              type="button"
                              disabled={creatingCustomer}
                              onClick={createNewCustomer}
                              className={primary}
                            >
                              {creatingCustomer ? (
                                <LoaderCircle
                                  size={14}
                                  className="animate-spin"
                                />
                              ) : (
                                <Check size={14} />
                              )}
                              {creatingCustomer
                                ? "Creating..."
                                : "Save Customer"}
                            </button>

                            <button
                              type="button"
                              disabled={creatingCustomer}
                              onClick={() => setShowNewCustomerForm(false)}
                              className={secondary}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      {isSale && (
                        <Field label="Doctor (optional)">
                          <select
                            className={select}
                            value={doctorId}
                            onChange={(event) =>
                              setDoctorId(event.target.value)
                            }
                          >
                            <option value="">Not selected</option>
                            {doctors?.items
                              .filter((item) => item.status === "active")
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                      )}
                      <Field label={isSale ? "Sale date" : "Issue date"}>
                        <input
                          required
                          type="date"
                          className={input}
                          value={date}
                          readOnly
                          onChange={(event) => setDate(event.target.value)}
                        />
                      </Field>
                      {!isSale && (
                        <Field label="Valid until">
                          <input
                            required
                            type="date"
                            className={input}
                            value={validUntil}
                            onChange={(event) =>
                              setValidUntil(event.target.value)
                            }
                          />
                        </Field>
                      )}
                    </>
                  )}
                </div>
              </section>
              <section className={surface}>
                <div className="flex flex-col gap-3 border-b border-[#edf1ef] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-[13px] font-semibold text-[#26352f]">
                      Items
                    </h2>
                    <p className="mt-1 text-[10px] text-[#95a09c]">
                      Prices, tax rates, and totals are recalculated on the
                      server.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search
                      size={14}
                      className="absolute left-3 top-2.5 text-[#98a49e]"
                    />
                    <input
                      className={`${input} pl-9`}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search medicines…"
                      aria-label="Search medicines"
                    />
                    {search && (
                      <div className="absolute left-0 right-0 top-10 z-10 rounded-lg border border-[#e7ede9] bg-white p-1 shadow-lg">
                        {(medicines.items ?? [])
                          .filter((item) =>
                            `${item.name} ${item.sku}`
                              .toLowerCase()
                              .includes(search.toLowerCase()),
                          )
                          .slice(0, 6)
                          .map((item) => (
                            <button
                              type="button"
                              key={item.id}
                              onClick={() => addLine(item.id)}
                              className="block w-full rounded-md px-3 py-2 text-left text-[11px] hover:bg-[#eff8f3]"
                            >
                              {item.name}
                              <span className="float-right text-[#84918b]">
                                {money(item.sellingPricePaise)}
                              </span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3 p-4">
                  {lines.map((line, index) => {
                    const medicine = productById.get(line.medicineId);
                    const batches = (inventory?.items ?? []).filter(
                      (batch) =>
                        batch.medicineId === line.medicineId &&
                        batch.quantityOnHand > 0 &&
                        batch.expiryDate >= date,
                    );
                    return (
                      <div
                        key={`${line.medicineId}-${index}`}
                        className="rounded-xl border border-[#e8eeeb] p-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <Field label={`Medicine ${index + 1}`}>
                              <select
                                required
                                className={select}
                                value={line.medicineId}
                                onChange={(event) => {
                                  const selected = productById.get(
                                    event.target.value,
                                  );
                                  // changeLine(index, {
                                  //   medicineId: event.target.value,
                                  //   unitPriceRupees: selected
                                  //     ? paiseToRupees(
                                  //         isPurchase
                                  //           ? selected.purchasePricePaise
                                  //           : selected.sellingPricePaise,
                                  //       )
                                  //     : "0.00",
                                  //   sellingPriceRupees: selected
                                  //     ? paiseToRupees(
                                  //         selected.sellingPricePaise,
                                  //       )
                                  //     : "0.00",
                                  //   batchId: "",
                                  // });
                                  changeLine(index, {
                                    medicineId: event.target.value,
                                    quantity: selected
                                      ? selected.unitId === "uni_001"
                                        ? selected.stripSize
                                        : 1
                                      : 1,
                                    discountPercent: 0,
                                    stripSize: selected?.stripSize ?? 1,
                                    unitCode:
                                      selected?.unitId === "uni_001"
                                        ? "STR"
                                        : "",
                                    unitPriceRupees: selected
                                      ? paiseToRupees(
                                          isPurchase
                                            ? selected.purchasePricePaise
                                            : selected.sellingPricePaise,
                                        )
                                      : "0.00",
                                    sellingPriceRupees: selected
                                      ? paiseToRupees(
                                          selected.sellingPricePaise,
                                        )
                                      : "0.00",
                                    batchId: "",
                                  });
                                }}
                              >
                                <option value="">Select medicine</option>
                                {medicines.items
                                  .filter((item) => item.status === "active")
                                  .map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name} · {item.sku}
                                    </option>
                                  ))}
                              </select>
                            </Field>
                          </div>
                          <button
                            type="button"
                            className="rounded-md p-2 text-[#9b6159] hover:bg-[#fff5f3] disabled:opacity-40"
                            disabled={lines.length === 1}
                            // onClick={() =>
                            //   setLines((current) =>
                            //     current.filter(
                            //       (_, lineIndex) => lineIndex !== index,
                            //     ),
                            //   )
                            // }
                            onClick={() =>
                              setLines((current) => [
                                ...current,
                                {
                                  medicineId: "",
                                  quantity: 1,
                                  discountPercent: 0,
                                  stripSize: 1,
                                  unitCode: "",
                                  unitPriceRupees: "0.00",
                                  batchNumber: "",
                                  expiryDate: "",
                                  sellingPriceRupees: "0.00",
                                  reorderLevel: 0,
                                  batchId: "",
                                },
                              ])
                            }
                            aria-label={`Remove line ${index + 1}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <Field label="Quantity">
                            <input
                              required
                              min="1"
                              type="number"
                              className={input}
                              value={line.quantity}
                              onChange={(event) =>
                                changeLine(index, {
                                  quantity: Number(event.target.value),
                                })
                              }
                            />
                          </Field>
                          {isPurchase ? (
                            <>
                              <Field label="Purchase rate (₹)">
                                <input
                                  required
                                  min="0"
                                  step="0.01"
                                  type="number"
                                  className={input}
                                  value={line.unitPriceRupees}
                                  onChange={(event) =>
                                    changeLine(index, {
                                      unitPriceRupees: event.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <Field label="Batch number">
                                <input
                                  required
                                  className={input}
                                  value={line.batchNumber}
                                  onChange={(event) =>
                                    changeLine(index, {
                                      batchNumber: event.target.value,
                                    })
                                  }
                                  placeholder="Supplier batch"
                                />
                              </Field>
                              <Field label="Expiry">
                                <input
                                  required
                                  type="date"
                                  className={input}
                                  value={line.expiryDate}
                                  onChange={(event) =>
                                    changeLine(index, {
                                      expiryDate: event.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <Field label="Selling rate (₹)">
                                <input
                                  required
                                  min="0"
                                  step="0.01"
                                  type="number"
                                  className={input}
                                  value={line.sellingPriceRupees}
                                  onChange={(event) =>
                                    changeLine(index, {
                                      sellingPriceRupees: event.target.value,
                                    })
                                  }
                                />
                              </Field>
                            </>
                          ) : (
                            <>
                              {isSale && (
                                <Field label="Batch preference">
                                  <select
                                    className={select}
                                    value={line.batchId ?? ""}
                                    onChange={(event) =>
                                      changeLine(index, {
                                        batchId: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="">Automatic FEFO</option>
                                    {batches.map((batch) => (
                                      <option
                                        key={batch.batchId}
                                        value={batch.batchId}
                                      >
                                        {batch.batchNumber} ·{" "}
                                        {batch.quantityOnHand} on hand · exp{" "}
                                        {batch.expiryDate}
                                      </option>
                                    ))}
                                  </select>
                                </Field>
                              )}
                              <Field label="Discount (%)">
                                <input
                                  min="0"
                                  max="100"
                                  step="1"
                                  type="number"
                                  className={input}
                                  value={line.discountPercent}
                                  onChange={(event) =>
                                    changeLine(index, {
                                      discountPercent: Number(
                                        event.target.value,
                                      ),
                                    })
                                  }
                                />
                              </Field>
                              <div className="rounded-lg bg-[#f7faf8] px-3 py-2">
                                <p className="text-[9px] text-[#95a09c]">
                                  Unit price
                                </p>
                                <p className="mt-1 text-xs font-semibold text-[#405149]">
                                  {medicine
                                    ? money(medicine.sellingPricePaise)
                                    : "—"}
                                </p>
                              </div>
                            </>
                          )}
                          {isPurchase && (
                            <Field label="Discount (%)">
                              <input
                                min="0"
                                max="100"
                                step="1"
                                type="number"
                                className={input}
                                value={line.discountPercent}
                                onChange={(event) =>
                                  changeLine(index, {
                                    discountPercent: Number(event.target.value),
                                  })
                                }
                              />
                            </Field>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-[#edf1ef] p-4">
                  <button
                    type="button"
                    className={secondary}
                    onClick={() =>
                      setLines((current) => [
                        ...current,
                        {
                          medicineId: "",
                          quantity: 1,
                          discountPercent: 0,
                          stripSize: 1,
                          unitCode: "",
                          unitPriceRupees: "0.00",
                          batchNumber: "",
                          expiryDate: "",
                          sellingPriceRupees: "0.00",
                          reorderLevel: 0,
                          batchId: "",
                        },
                      ])
                    }
                  >
                    <CirclePlus size={14} /> Add item
                  </button>
                </div>
              </section>
            </div>
            <aside className={`${surface} sticky top-24 p-4`}>
              <h2 className="text-[13px] font-semibold text-[#26352f]">
                Draft summary
              </h2>
              <div className="mt-4 flex flex-col gap-3 text-[11px]">
                <div className="flex justify-between text-[#798680]">
                  <span>Lines</span>
                  <span>{lines.length}</span>
                </div>
                <div className="flex justify-between text-[#798680]">
                  <span>Pre-tax estimate</span>
                  <span className="text-[15px] text-black">{money(runningTotal)}</span>
                </div>
                <div className="border-t border-dashed border-[#dfe8e3] pt-3">
                  <p className="text-[10px] leading-5 text-[#77847e]">
                    Server totals may include configured tax and can differ from
                    this estimate.
                  </p>
                </div>
              </div>
              {/* <div className="mt-4 flex flex-col gap-3 text-[11px]">
                <div className="flex justify-between text-[#798680]">
                  <span>Lines</span>
                  <span>{lines.length}</span>
                </div>

                <div className="border-t border-dashed border-[#dfe8e3] pt-3">
                  <div className="rounded-xl border border-[#b9d9c9] bg-[#edf8f2] px-4 py-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#527663]">
                      Pre-tax estimate
                    </p>
                    <p className="mt-2 text-xl font-extrabold tracking-tight text-[#176b45]">
                      {money(runningTotal)}
                    </p>
                    <p className="mt-1 text-[10px] font-medium text-[#668675]">
                      Estimated amount before tax
                    </p>
                  </div>
                </div>

                <div className="border-t border-dashed border-[#dfe8e3] pt-3">
                  <p className="text-[10px] leading-5 text-[#77847e]">
                    Server totals may include configured tax and can differ from
                    this estimate.
                  </p>
                </div>
              </div> */}
              <button
                disabled={pending}
                className={`${primary} mt-5 w-full`}
                type="submit"
              >
                {pending ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}{" "}
                {pending
                  ? "Saving…"
                  : initial
                    ? "Save draft changes"
                    : "Save draft"}
              </button>
              {!isPurchase && !isSale && (
                <p className="mt-3 text-[10px] leading-5 text-[#8d9993]">
                  The quotation can be printed or converted into a draft sale
                  after creation.
                </p>
              )}
            </aside>
          </form>
        )
      }
    </>
  );
}

function TransactionDetail({
  section,
  data,
  onChanged,
}: {
  section: PageSection;
  data: AnyRecord;
  onChanged: (next?: string) => void | Promise<void>;
}) {
  const refresh = useApiRefresh();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const { data: medicines } = useSWR<{ items: Medicine[] }>(
    "/api/v1/medicines?page=1&pageSize=100",
    fetcher,
  );
  const { data: suppliers } = useSWR<{ items: Supplier[] }>(
    section === "purchases" ? "/api/v1/suppliers?page=1&pageSize=100" : null,
    fetcher,
  );
  const { data: patients } = useSWR<{ items: Patient[] }>(
    section === "sales" || section === "quotations"
      ? "/api/v1/patients?page=1&pageSize=100"
      : null,
    fetcher,
  );
  const record: AnyRecord =
    data.purchase ??
    data.sale ??
    data.quotation ??
    data.payment ??
    data.expense ??
    data;
  const recordId = record.id;
  const label =
    section === "purchases"
      ? record.invoiceNumber
      : section === "sales"
        ? record.invoiceNumber
        : section === "quotations"
          ? record.quotationNumber
          : record.id;
  const heading =
    section === "purchases"
      ? "Purchase details"
      : section === "sales"
        ? "Sale details"
        : section === "quotations"
          ? "Quotation details"
          : section === "payments"
            ? "Payment details"
            : section === "expenses"
              ? "Expense details"
              : "Cash-book entry";
  const back = `/${section}`;
  const tryAction = async (
    path: string,
    payload: unknown,
    message: string,
    key?: string,
  ) => {
    setBusy(true);
    setError("");
    try {
      await send(path, "POST", payload, key);
      await refresh();
      await onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : message);
    } finally {
      setBusy(false);
    }
  };
  const party =
    section === "purchases"
      ? suppliers?.items.find((item) => item.id === record.supplierId)?.name
      : patients?.items.find((item) => item.id === record.patientId)?.name;
  const showLines = ["purchases", "sales", "quotations"].includes(section);
  const invoicePresentation = data.invoicePresentation ?? {
    showGstBreakdown: true,
    footer: "",
  };
  const pharmacyProfile = data.pharmacyProfile;
  return (
    <>
      <PageHeading
        title={heading}
        description={`${label || recordId} · Recorded transaction history`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link className={secondary} href={back}>
              <ChevronLeft size={14} /> Back
            </Link>
            <button className={secondary} onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
          </div>
        }
      />
      <Notice error={error} />
      {showLines && (
        <div className="mb-4 hidden border-b border-[#dfe8e3] pb-4 print:block">
          <h1 className="text-lg font-semibold text-[#21332b]">
            {pharmacyProfile?.name}
          </h1>
          <p className="mt-1 text-xs text-[#627169]">
            {pharmacyProfile?.legalName} · {pharmacyProfile?.address},{" "}
            {pharmacyProfile?.city}, {pharmacyProfile?.state}
          </p>
          <p className="mt-1 text-xs text-[#627169]">
            Phone: {pharmacyProfile?.phone} · GSTIN: {pharmacyProfile?.gstin}
          </p>
          <p className="mt-1 text-xs font-semibold">
            {heading}: {label}
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
        <section className={`${surface} p-4 md:p-5`}>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-base font-semibold text-[#26352f]">
                {label ?? record.description ?? record.reference ?? recordId}
              </h2>
              <p className="mt-1 text-[10px] text-[#87938e]">
                {party ??
                  (section === "sales" || section === "quotations"
                    ? "Walk-in customer"
                    : "")}
              </p>
            </div>
            {record.status && <Status value={record.status} />}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-y border-[#edf1ef] py-4 text-[10px] sm:grid-cols-4">
            <Info
              label="Date"
              value={dateLabel(
                record.purchasedOn ??
                  record.soldOn ??
                  record.issuedOn ??
                  record.paidOn ??
                  record.incurredOn ??
                  record.occurredOn,
              )}
            />
            <Info
              label="Total / amount"
              value={money(record.totalPaise ?? record.amountPaise ?? 0)}
            />
            {record.paidPaise !== undefined && (
              <Info label="Paid" value={money(record.paidPaise)} />
            )}
            <Info
              label="Outstanding"
              value={
                record.totalPaise !== undefined
                  ? money(record.totalPaise - record.paidPaise)
                  : "—"
              }
            />
          </div>
          {showLines && (
            <div className="mt-5">
              <h3 className="mb-3 text-xs font-semibold text-[#35443d]">
                Items
              </h3>
              <Table
                headings={
                  invoicePresentation.showGstBreakdown
                    ? [
                        "Medicine",
                        "Batch",
                        "Qty",
                        "Unit price",
                        "Discount",
                        "Tax",
                        "Line total",
                      ]
                    : [
                        "Medicine",
                        "Batch",
                        "Qty",
                        "Unit price",
                        "Discount",
                        "Line total",
                      ]
                }
              >
                <>
                  {(data.items ?? []).map((item: AnyRecord) => {
                    const medicine = medicines?.items.find(
                      (entry) => entry.id === item.medicineId,
                    );
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-[#f0f3f1] last:border-0"
                      >
                        <td className="px-4 py-3 text-[11px] font-semibold text-[#37473f]">
                          {medicine?.name ?? item.medicineId}
                        </td>
                        <td className="px-4 py-3 text-[11px] text-[#68766f]">
                          {item.batchNumber ??
                            item.batchId ??
                            "FEFO at completion"}
                        </td>
                        <td className="px-4 py-3 text-[11px]">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-[11px]">
                          {money(item.unitPricePaise)}
                        </td>
                        <td className="px-4 py-3 text-[11px]">
                          {money(item.discountPaise)}
                        </td>
                        <td className="px-4 py-3 text-[11px]">
                          {money(item.taxPaise)}
                        </td>
                        <td className="px-4 py-3 text-[11px] font-semibold">
                          {money(item.lineTotalPaise)}
                        </td>
                      </tr>
                    );
                  })}
                </>
              </Table>
            </div>
          )}
          {Array.isArray(data.payments) && (
            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#35443d]">
                  Payment history
                </h3>
                {data.payments.length === 0 && (
                  <span className="text-[10px] text-[#929d98]">
                    No payments recorded
                  </span>
                )}
              </div>
              {data.payments.map((payment: Payment) => (
                <Link
                  key={payment.id}
                  href={`/payments/${payment.id}`}
                  className="flex items-center justify-between border-t border-[#edf1ef] py-2.5 text-[10px] hover:bg-[#fafcfb]"
                >
                  <span>
                    {dateLabel(payment.paidOn)} ·{" "}
                    {payment.reference || payment.method}
                  </span>
                  <span className="font-semibold text-[#34443d]">
                    {money(payment.amountPaise)}
                  </span>
                </Link>
              ))}
            </div>
          )}
          {section === "quotations" && (
            <div className="mt-4 rounded-lg bg-[#f7faf8] p-3 text-[10px] text-[#708078]">
              Valid until {dateLabel(record.validUntil)} · This quotation does
              not reserve stock or create a payment.
            </div>
          )}
          {section === "payments" && data.transaction && (
            <div className="mt-5 rounded-lg bg-[#f7faf8] p-3 text-[10px] text-[#708078]">
              Allocated to{" "}
              <Link
                className="font-semibold text-[#18765e]"
                href={`/${record.transactionType === "sale" ? "sales" : "purchases"}/${record.transactionId}`}
              >
                {data.transaction.invoiceNumber}
              </Link>
            </div>
          )}
          {section === "expenses" && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Info label="Category" value={record.category} />
              <Info
                label="Method"
                value={String(record.method).replaceAll("_", " ")}
              />
              <Info label="Reference" value={record.reference || "—"} />
              <Info label="Notes" value={record.notes || "—"} />
            </div>
          )}
          {section === "cash-book" && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Info label="Direction" value={record.entryType} />
              <Info
                label="Reference"
                value={
                  record.reference ??
                  record.paymentId ??
                  record.expenseId ??
                  "Manual entry"
                }
              />
              <Info label="Payment" value={record.paymentId ?? "—"} />
              <Info label="Expense" value={record.expenseId ?? "—"} />
            </div>
          )}
        </section>
        <aside className={`${surface} p-4`}>
          <h2 className="text-[13px] font-semibold text-[#26352f]">
            Available actions
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {section === "purchases" && record.status === "draft" && (
              <>
                <Link
                  className={`${secondary} w-full`}
                  href={`/purchases/${record.id}/edit`}
                >
                  Edit draft
                </Link>
                <button
                  disabled={busy}
                  className={`${primary} w-full`}
                  onClick={() =>
                    tryAction(
                      `/api/v1/purchases/${record.id}/receive`,
                      {},
                      "Could not receive purchase",
                      `receive-${record.id}`,
                    )
                  }
                >
                  Receive stock
                </button>
                <button
                  disabled={busy}
                  className={`${secondary} w-full`}
                  onClick={() =>
                    window.confirm("Cancel this purchase draft?") &&
                    tryAction(
                      `/api/v1/purchases/${record.id}/cancel`,
                      {},
                      "Could not cancel purchase",
                      `cancel-${record.id}`,
                    )
                  }
                >
                  Cancel draft
                </button>
              </>
            )}
            {section === "purchases" &&
              record.status === "received" &&
              record.paidPaise < record.totalPaise && (
                <button
                  className={`${primary} w-full`}
                  onClick={() => setPaymentOpen(true)}
                >
                  Record supplier payment
                </button>
              )}
            {section === "sales" && record.status === "draft" && (
              <>
                <Link
                  className={`${secondary} w-full`}
                  href={`/sales/${record.id}/edit`}
                >
                  Edit draft
                </Link>
                <button
                  disabled={busy}
                  className={`${primary} w-full`}
                  onClick={() => setCompletionOpen(true)}
                >
                  Complete sale
                </button>
                <button
                  disabled={busy}
                  className={`${secondary} w-full`}
                  onClick={() =>
                    window.confirm("Cancel this sale draft?") &&
                    tryAction(
                      `/api/v1/sales/${record.id}/cancel`,
                      {},
                      "Could not cancel sale",
                      `cancel-${record.id}`,
                    )
                  }
                >
                  Cancel draft
                </button>
              </>
            )}
            {section === "sales" &&
              ["completed", "partially_paid"].includes(record.status) &&
              record.paidPaise < record.totalPaise && (
                <button
                  className={`${primary} w-full`}
                  onClick={() => setPaymentOpen(true)}
                >
                  Record customer payment
                </button>
              )}
            {section === "sales" &&
              ["completed", "partially_paid"].includes(record.status) &&
              record.paidPaise === 0 && (
                <button
                  className={`${secondary} w-full`}
                  onClick={() =>
                    window.confirm(
                      "Reverse this unpaid sale and restore its stock?",
                    ) &&
                    tryAction(
                      `/api/v1/sales/${record.id}/cancel`,
                      {},
                      "Could not reverse sale",
                      `reverse-${record.id}`,
                    )
                  }
                >
                  Reverse unpaid sale
                </button>
              )}
            {section === "quotations" && record.status === "draft" && (
              <>
                <Link
                  className={`${secondary} w-full`}
                  href={`/quotations/${record.id}/edit`}
                >
                  Edit draft
                </Link>
                <button
                  disabled={busy}
                  className={`${primary} w-full`}
                  onClick={() =>
                    tryAction(
                      `/api/v1/quotations/${record.id}/status`,
                      { status: "sent" },
                      "Could not update quotation",
                    )
                  }
                >
                  Mark as sent
                </button>
              </>
            )}
            {section === "quotations" && record.status === "sent" && (
              <>
                <button
                  className={secondary}
                  onClick={() =>
                    tryAction(
                      `/api/v1/quotations/${record.id}/status`,
                      { status: "accepted" },
                      "Could not accept quotation",
                    )
                  }
                >
                  Accept
                </button>
                <button
                  className={secondary}
                  onClick={() =>
                    tryAction(
                      `/api/v1/quotations/${record.id}/status`,
                      { status: "rejected" },
                      "Could not reject quotation",
                    )
                  }
                >
                  Reject
                </button>
              </>
            )}
            {section === "quotations" &&
              ["draft", "sent", "accepted"].includes(record.status) &&
              !record.convertedSaleId && (
                <button
                  disabled={busy}
                  className={`${primary} w-full`}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const converted = await send<AnyRecord>(
                        `/api/v1/quotations/${record.id}/convert-to-sale`,
                        "POST",
                        {},
                        `convert-${record.id}`,
                      );
                      await refresh();
                      await onChanged(`/sales/${converted.data.sale.id}`);
                    } catch (actionError) {
                      setError(
                        actionError instanceof Error
                          ? actionError.message
                          : "Could not convert quotation",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Convert to draft sale
                </button>
              )}
            {section === "expenses" && (
              <Link
                className={`${secondary} w-full`}
                href={`/expenses/${record.id}/edit`}
              >
                Edit expense
              </Link>
            )}
            {busy && (
              <p
                role="status"
                className="flex items-center gap-2 text-[10px] text-[#718078]"
              >
                <LoaderCircle size={13} className="animate-spin" /> Saving
                changes…
              </p>
            )}
          </div>
        </aside>
      </div>
      {paymentOpen && (
        <PaymentDialog
          transactionType={section === "purchases" ? "purchase" : "sale"}
          presetTransactionId={record.id}
          suppliers={suppliers?.items ?? []}
          patients={patients?.items ?? []}
          onClose={() => setPaymentOpen(false)}
          onSaved={async () => {
            setPaymentOpen(false);
            await refresh();
            await onChanged();
          }}
        />
      )}
      {completionOpen && (
        <SaleCompletionDialog
          sale={record as Sale}
          onClose={() => setCompletionOpen(false)}
          onSaved={async () => {
            setCompletionOpen(false);
            await refresh();
            await onChanged();
          }}
        />
      )}
    </>
  );
}
function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-[#f8faf9] px-3 py-2">
      <p className="text-[9px] font-medium capitalize text-[#98a29d]">
        {label}
      </p>
      <p className="mt-1 break-words text-[11px] font-semibold capitalize text-[#45544c]">
        {value}
      </p>
    </div>
  );
}

function SaleCompletionDialog({
  sale,
  onClose,
  onSaved,
}: {
  sale: Sale;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [method, setMethod] = useState<
    "cash" | "upi" | "card" | "bank_transfer" | "credit"
  >("cash");
  const [amount, setAmount] = useState(paiseToRupees(sale.totalPaise));
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    const payload = {
      payment: {
        amountPaise: method === "credit" ? 0 : rupeesToPaise(amount),
        method,
        reference: reference.trim() || sale.invoiceNumber,
      },
    };
    try {
      const keyState = newKey(keyRef.current, payload);
      keyRef.current = keyState;
      await send(
        `/api/v1/sales/${sale.id}/complete`,
        "POST",
        payload,
        keyState.key,
      );
      await onSaved();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not complete sale",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal title="Complete sale" onClose={onClose}>
      <Notice error={error} />
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <div className="rounded-lg bg-[#f3f8f5] p-3 text-[10px] text-[#708078]">
          Invoice total:{" "}
          <strong className="text-[#405149]">{money(sale.totalPaise)}</strong>
          <p className="mt-1">
            Stock will be deducted using the selected batch or FEFO during
            completion.
          </p>
        </div>
        <Field label="Settlement method">
          <select
            className={select}
            value={method}
            onChange={(event) => setMethod(event.target.value as typeof method)}
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="credit">Credit (pay later)</option>
          </select>
        </Field>
        {method !== "credit" && (
          <>
            <Field label="Amount received now (₹)">
              <input
                required
                min="0"
                step="0.01"
                max={paiseToRupees(sale.totalPaise)}
                type="number"
                className={input}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <Field label="Reference number">
              <input
                className={input}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Optional receipt reference"
              />
            </Field>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondary} onClick={onClose}>
            Cancel
          </button>
          <button disabled={pending} className={primary} type="submit">
            {pending ? "Completing…" : "Complete sale"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ExpenseEditor({ initial }: { initial?: Expense } = {}) {
  const router = useRouter();
  const refresh = useApiRefresh();
  const [category, setCategory] = useState(initial?.category ?? "supplies");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [incurredOn, setIncurredOn] = useState(initial?.incurredOn ?? today());
  const [amount, setAmount] = useState(
    initial ? paiseToRupees(initial.amountPaise) : "",
  );
  const [method, setMethod] = useState(initial?.method ?? "cash");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [paidInCash, setPaidInCash] = useState(initial?.paidInCash ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    const payload = {
      category,
      description: description.trim(),
      incurredOn,
      amountPaise: rupeesToPaise(amount),
      method,
      reference: reference.trim(),
      notes,
      paidInCash,
    };
    try {
      const keyState = newKey(keyRef.current, payload);
      keyRef.current = keyState;
      await send(
        initial ? `/api/v1/expenses/${initial.id}` : "/api/v1/expenses",
        initial ? "PATCH" : "POST",
        payload,
        keyState.key,
      );
      await refresh();
      router.push(initial ? `/expenses/${initial.id}` : "/expenses");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save expense",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <PageHeading
        title={initial ? "Edit expense" : "Add expense"}
        description="Expense edits preserve cash-book history by recording balancing entries."
        action={
          <Link
            className={secondary}
            href={initial ? `/expenses/${initial.id}` : "/expenses"}
          >
            <X size={14} /> Cancel
          </Link>
        }
      />
      <Notice error={error} />
      <form onSubmit={submit} className={`${surface} max-w-3xl p-4 md:p-6`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select
              className={select}
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as Expense["category"])
              }
            >
              {[
                "rent",
                "utilities",
                "supplies",
                "salary",
                "maintenance",
                "transport",
                "other",
              ].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <input
              required
              className={input}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field label="Date">
            <input
              required
              type="date"
              className={input}
              value={incurredOn}
              onChange={(event) => setIncurredOn(event.target.value)}
            />
          </Field>
          <Field label="Amount (₹)">
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              className={input}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Payment method">
            <select
              className={select}
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as Expense["method"])
              }
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="credit">Credit</option>
            </select>
          </Field>
          <Field label="Reference">
            <input
              className={input}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className={`${input} h-20 py-2`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-[11px] text-[#586761] sm:col-span-2">
            <input
              type="checkbox"
              checked={paidInCash}
              onChange={(event) => setPaidInCash(event.target.checked)}
              className="accent-[#157a62]"
            />{" "}
            Include this expense in the cash book
          </label>
        </div>
        <button disabled={pending} className={`${primary} mt-5`} type="submit">
          {pending ? "Saving…" : initial ? "Save expense" : "Record expense"}
        </button>
      </form>
    </>
  );
}

function CashEntryEditor() {
  const router = useRouter();
  const refresh = useApiRefresh();
  const [entryType, setEntryType] = useState<"inflow" | "outflow">("inflow");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(today());
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    const payload = {
      entryType,
      amountPaise: rupeesToPaise(amount),
      occurredOn,
      description: description.trim(),
      reference: reference.trim(),
    };
    try {
      const keyState = newKey(keyRef.current, payload);
      keyRef.current = keyState;
      await send("/api/v1/cash-book", "POST", payload, keyState.key);
      await refresh();
      router.push("/cash-book");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not record cash entry",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <PageHeading
        title="Manual cash-book entry"
        description="Use a manual entry for an audited cash movement not linked to an invoice or expense."
        action={
          <Link className={secondary} href="/cash-book">
            <X size={14} /> Cancel
          </Link>
        }
      />
      <Notice error={error} />
      <form onSubmit={submit} className={`${surface} max-w-2xl p-4 md:p-6`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Direction">
            <select
              className={select}
              value={entryType}
              onChange={(event) =>
                setEntryType(event.target.value as typeof entryType)
              }
            >
              <option value="inflow">Cash received</option>
              <option value="outflow">Cash paid</option>
            </select>
          </Field>
          <Field label="Date">
            <input
              required
              type="date"
              className={input}
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </Field>
          <Field label="Amount (₹)">
            <input
              required
              min="0.01"
              step="0.01"
              type="number"
              className={input}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label="Reference">
            <input
              required
              className={input}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <input
              required
              className={input}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>
        <button disabled={pending} className={`${primary} mt-5`} type="submit">
          {pending ? "Saving…" : "Add cash entry"}
        </button>
      </form>
    </>
  );
}

function PaymentEditor() {
  const router = useRouter();
  const refresh = useApiRefresh();
  const { data: suppliers } = useSWR<{ items: Supplier[] }>(
    "/api/v1/suppliers?page=1&pageSize=100",
    fetcher,
  );
  const { data: patients } = useSWR<{ items: Patient[] }>(
    "/api/v1/patients?page=1&pageSize=100",
    fetcher,
  );
  return (
    <>
      <PageHeading
        title="Record payment"
        description="Allocate a partial or full payment to an open invoice."
        action={
          <Link href="/payments" className={secondary}>
            <X size={14} /> Cancel
          </Link>
        }
      />
      <PaymentDialog
        routeMode
        suppliers={suppliers?.items ?? []}
        patients={patients?.items ?? []}
        onClose={() => router.push("/payments")}
        onSaved={async () => {
          await refresh();
          router.push("/payments");
          router.refresh();
        }}
      />
    </>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-modal-title"
        className="w-full max-w-lg rounded-2xl border border-[#e6ece9] bg-white p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2
              id="transaction-modal-title"
              className="text-base font-semibold text-[#24352d]"
            >
              {title}
            </h2>
            <p className="mt-1 text-[11px] text-[#929d98]">
              This action is recorded in transaction history.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-[#7e8984] hover:bg-[#f2f6f4]"
          >
            <X size={17} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function PaymentDialog(props: {
  transactionType?: "sale" | "purchase";
  presetTransactionId?: string;
  suppliers?: Supplier[];
  patients?: Patient[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  routeMode?: boolean;
}) {
  const [type, setType] = useState<"sale" | "purchase">(
    props.transactionType ?? "sale",
  );
  const [transactionId, setTransactionId] = useState(
    props.presetTransactionId ?? "",
  );
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof methods)[number]>("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const { data: sales } = useSWR<{ items: Sale[] }>(
    type === "sale" ? "/api/v1/sales?page=1&pageSize=100" : null,
    fetcher,
  );
  const { data: purchases } = useSWR<{ items: Purchase[] }>(
    type === "purchase" ? "/api/v1/purchases?page=1&pageSize=100" : null,
    fetcher,
  );
  const eligible =
    type === "sale"
      ? (sales?.items ?? []).filter(
          (item) =>
            ["completed", "partially_paid"].includes(item.status) &&
            item.totalPaise > item.paidPaise,
        )
      : (purchases?.items ?? []).filter(
          (item) =>
            item.status === "received" && item.totalPaise > item.paidPaise,
        );
  const selected = eligible.find((item) => item.id === transactionId);
  const outstanding = selected ? selected.totalPaise - selected.paidPaise : 0;
  const form = (
    <>
      <Notice error={error} />
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          const payload = {
            transactionType: type,
            transactionId,
            amountPaise: rupeesToPaise(amount),
            method,
            reference: reference.trim(),
            paidOn: today(),
          };
          try {
            const keyState = newKey(keyRef.current, payload);
            keyRef.current = keyState;
            await send("/api/v1/payments", "POST", payload, keyState.key);
            await props.onSaved();
          } catch (requestError) {
            setError(
              requestError instanceof Error
                ? requestError.message
                : "Could not record payment",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {!props.transactionType && (
          <Field label="Payment direction">
            <select
              className={select}
              value={type}
              onChange={(event) => {
                setType(event.target.value as typeof type);
                setTransactionId("");
              }}
            >
              <option value="sale">Received from customer</option>
              <option value="purchase">Paid to supplier</option>
            </select>
          </Field>
        )}
        <Field label={type === "sale" ? "Invoice" : "Purchase"}>
          <select
            required
            disabled={Boolean(props.presetTransactionId)}
            className={select}
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
          >
            <option value="">Select an outstanding transaction</option>
            {eligible.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.invoiceNumber} ·{" "}
                {type === "sale"
                  ? (props.patients?.find(
                      (party) => party.id === (entry as Sale).patientId,
                    )?.name ?? "Walk-in")
                  : (props.suppliers?.find(
                      (party) => party.id === (entry as Purchase).supplierId,
                    )?.name ?? "Supplier")}{" "}
                · due {money(entry.totalPaise - entry.paidPaise)}
              </option>
            ))}
          </select>
        </Field>
        <div className="rounded-lg bg-[#f3f8f5] p-3 text-[10px] text-[#708078]">
          Outstanding balance:{" "}
          <strong className="text-[#405149]">{money(outstanding)}</strong>
        </div>
        <Field label="Amount (₹)">
          <input
            required
            min="0.01"
            step="0.01"
            max={paiseToRupees(outstanding)}
            type="number"
            className={input}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Field label="Method">
          <select
            className={select}
            value={method}
            onChange={(event) =>
              setMethod(event.target.value as (typeof methods)[number])
            }
          >
            {methods.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference number">
          <input
            required
            className={input}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="UPI / card / bank reference"
          />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          {!props.routeMode && (
            <button type="button" className={secondary} onClick={props.onClose}>
              Cancel
            </button>
          )}
          <button
            disabled={pending || !transactionId}
            className={primary}
            type="submit"
          >
            {pending ? "Recording…" : "Record payment"}
          </button>
        </div>
      </form>
    </>
  );
  return props.routeMode ? (
    <section className={`${surface} max-w-2xl p-4 md:p-6`}>{form}</section>
  ) : (
    <Modal title="Record payment" onClose={props.onClose}>
      {form}
    </Modal>
  );
}
