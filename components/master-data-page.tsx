"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LoaderCircle,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";

type Row = Record<string, unknown> & { id: string; status?: string };
type ApiData<T> = { success: boolean; message: string; data: T };
type ListData = {
  items: Row[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
type SessionData = {
  user: {
    id: string;
    name: string;
    email: string;
    role: "admin" | "pharmacist" | "cashier";
    status: "active" | "inactive";
  } | null;
};
// type Field = { key: string; label: string; type?: 'text' | 'email' | 'number' | 'date' | 'select' | 'checkbox'; required?: boolean; options?: Array<{ label: string; value: string }>; step?: string; min?: string; apiKey?: string }
type Field = {
  key: string;
  label: string;
  type?: "text" | "email" | "number" | "date" | "select" | "checkbox";
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  step?: string;
  min?: string;
  apiKey?: string;
  maxLength?: number;
  inputMode?: "numeric" | "text" | "decimal" | "tel";
};
const panel =
  "rounded-xl border border-[#e7ede9] bg-white shadow-[0_2px_7px_rgba(24,55,42,.025)]";
const buttonPrimary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#157a62] px-3.5 text-xs font-semibold text-white transition hover:bg-[#116c56] disabled:cursor-not-allowed disabled:opacity-50";
const buttonSecondary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#dfe8e3] bg-white px-3.5 text-xs font-semibold text-[#43524c] transition hover:bg-[#f8faf9] disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "h-9 w-full rounded-lg border border-[#e0e8e4] bg-white px-3 text-xs text-[#26352f] outline-none focus:border-[#58a98c] focus:ring-2 focus:ring-[#e1f2eb]";

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const result = (await response.json()) as ApiData<T>;
  if (!response.ok) throw new Error(result.message || "Could not load records");
  return result.data;
}

const sections: Record<
  string,
  {
    title: string;
    description: string;
    columns: Array<{ key: string; label: string }>;
    fields: Field[];
    group: string;
  }
> = {
  medicines: {
    title: "Medicines",
    description: "Manage the catalog, pricing, and minimum stock thresholds.",
    group: "catalog",
    columns: [
      { key: "name", label: "Medicine" },
      { key: "sku", label: "SKU" },
      { key: "genericName", label: "Generic name" },
      { key: "manufacturer", label: "Manufacturer" },
      { key: "sellingPricePaise", label: "Selling price" },
      { key: "reorderLevel", label: "Min. stock" },
      { key: "status", label: "Status" },
    ],
    fields: [
      { key: "name", label: "Medicine name", required: true },
      { key: "sku", label: "SKU", required: true },
      { key: "genericName", label: "Generic name", required: true },
      { key: "categoryId", label: "Category", type: "select", required: true },
      { key: "unitId", label: "Unit", type: "select", required: true },
      { key: "manufacturer", label: "Manufacturer", required: true },
      {
        key: "stripSize",
        label: "Strip Size (Tablets per Strip)",
        type: "number",
        required: true,
        min: "1",
        step: "1",
      },
      {
        key: "purchasePrice",
        apiKey: "purchasePricePaise",
        label: "Purchase price (₹)",
        type: "number",
        min: "0",
        step: "0.01",
        required: true,
      },
      {
        key: "sellingPrice",
        apiKey: "sellingPricePaise",
        label: "Selling price (₹)",
        type: "number",
        min: "0",
        step: "0.01",
        required: true,
      },
      {
        key: "gstRate",
        apiKey: "gstRateBps",
        label: "GST rate (%)",
        type: "number",
        min: "0",
        step: "0.01",
        required: true,
      },
      {
        key: "reorderLevel",
        label: "Minimum stock",
        type: "number",
        min: "0",
        step: "1",
        required: true,
      },
      {
        key: "requiresPrescription",
        label: "Prescription required",
        type: "checkbox",
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "Active", value: "active" },
          { label: "Inactive", value: "inactive" },
        ],
        required: true,
      },
    ],
  },
  categories: {
    title: "Categories",
    description: "Organize the medicine catalog into clear, searchable groups.",
    group: "catalog",
    columns: [
      { key: "name", label: "Category" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status" },
    ],
    fields: [
      { key: "name", label: "Category name", required: true },
      { key: "description", label: "Description", required: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "Active", value: "active" },
          { label: "Inactive", value: "inactive" },
        ],
        required: true,
      },
    ],
  },
  units: {
    title: "Units",
    description:
      "Manage the measurement units used for medicine stock and billing.",
    group: "catalog",
    columns: [
      { key: "name", label: "Unit" },
      { key: "code", label: "Code" },
      { key: "description", label: "Description" },
      { key: "status", label: "Status" },
    ],
    fields: [
      { key: "name", label: "Unit name", required: true },
      { key: "code", label: "Short code", required: true },
      { key: "description", label: "Description", required: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "Active", value: "active" },
          { label: "Inactive", value: "inactive" },
        ],
        required: true,
      },
    ],
  },
  suppliers: {
    title: "Suppliers",
    description: "Keep supplier contacts and purchase relationships together.",
    group: "suppliers",
    columns: [
      { key: "name", label: "Supplier" },
      { key: "contactName", label: "Contact" },
      { key: "phone", label: "Phone" },
      { key: "gstin", label: "GSTIN" },
      { key: "city", label: "City" },
      { key: "status", label: "Status" },
    ],
    fields: [
      { key: "name", label: "Supplier name", required: true },
      { key: "contactName", label: "Contact person", required: true },
      { key: "phone", label: "Phone", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "gstin", label: "GSTIN", required: true },
      { key: "address", label: "Address", required: true },
      { key: "city", label: "City", required: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "Active", value: "active" },
          { label: "Inactive", value: "inactive" },
        ],
        required: true,
      },
    ],
  },
  patients: {
    title: "Customers & patients",
    description: "Manage customer contact details and billing records.",
    group: "patients",
    columns: [
      { key: "name", label: "Customer" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "city", label: "City" },
      { key: "status", label: "Status" },
    ],
    fields: [
      { key: "name", label: "Customer name*", required: true },
      {
        key: "phone",
        label: "Phone*",
        required: true,
        maxLength: 10,
        inputMode: "numeric",
      },
      { key: "email", label: "Email", type: "email", required: false },
      { key: "address", label: "Address*", required: true },
      { key: "city", label: "City", required: false },
      { key: "dateOfBirth", label: "Date of birth", type: "date" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "Active", value: "active" },
          { label: "Inactive", value: "inactive" },
        ],
        required: true,
      },
    ],
  },
  doctors: {
    title: "Doctors",
    description: "Manage prescribing doctors and clinic information.",
    group: "doctors",
    columns: [
      { key: "name", label: "Doctor" },
      { key: "registrationNumber", label: "Registration no." },
      { key: "specialization", label: "Specialization" },
      { key: "phone", label: "Phone" },
      { key: "clinic", label: "Clinic" },
    ],
    fields: [
      { key: "name", label: "Doctor name", required: true },
      {
        key: "registrationNumber",
        label: "Registration number",
        required: true,
      },
      { key: "specialization", label: "Specialization", required: true },
      { key: "phone", label: "Phone", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "clinic", label: "Clinic / hospital", required: true },
      { key: "city", label: "City", required: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "Active", value: "active" },
          { label: "Inactive", value: "inactive" },
        ],
        required: true,
      },
    ],
  },
  users: {
    title: "Users & access",
    description: "Manage staff accounts and their workspace roles.",
    group: "users",
    columns: [
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "role", label: "Role" },
      { key: "accountSetupRequired", label: "Account setup" },
      { key: "status", label: "Status" },
      { key: "lastLoginAt", label: "Last login" },
    ],
    fields: [
      { key: "name", label: "Full name", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      {
        key: "role",
        label: "Role",
        type: "select",
        options: [
          { label: "Administrator", value: "admin" },
          { label: "Pharmacist", value: "pharmacist" },
          { label: "Cashier", value: "cashier" },
        ],
        required: true,
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { label: "Active", value: "active" },
          { label: "Inactive", value: "inactive" },
        ],
        required: true,
      },
    ],
  },
};

const rolePermissions: Record<string, string[]> = {
  admin: ["*"],
  pharmacist: ["patients:write", "doctors:write"],
  cashier: ["patients:write"],
};
function hasWrite(role: string, permission: string) {
  const permissions = rolePermissions[role] ?? [];
  return (
    permissions.includes("*") || permissions.includes(`${permission}:write`)
  );
}
function formatCell(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "accountSetupRequired") return value ? "Setup required" : "Ready";
  if (key.endsWith("Paise"))
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(value) / 100);
  if (key === "lastLoginAt")
    return new Date(String(value)).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  if (key === "status")
    return String(value).replace(/^./, (letter) => letter.toUpperCase());
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
function formValue(field: Field, row?: Row | null) {
  if (!row)
    return field.type === "select" && field.key === "status"
      ? "active"
      : field.type === "checkbox"
        ? false
        : "";
  const value = row[field.apiKey ?? field.key];

  if (field.key === "purchasePrice" || field.key === "sellingPrice")
    return typeof value === "number" ? String(value / 100) : "";
  if (field.key === "gstRate")
    return typeof value === "number" ? String(value / 100) : "";
  if (field.type === "date" && typeof value === "string")
    return value.slice(0, 10);
  return value ?? "";
}

export function MasterDataPage({ section }: { section: string }) {
  const config = sections[section];
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [formVersion, setFormVersion] = useState(0);
  const [selectedUnitId, setSelectedUnitId] = useState("1");
  const key = `/api/v1/${section}?page=${page}&pageSize=10&sortBy=name&sortOrder=asc${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR<ListData>(
    config ? key : null,
    fetcher,
  );
  const { data: session } = useSWR<SessionData>(
    "/api/auth/get-session",
    fetcher,
  );
  const { data: categories } = useSWR<ListData>(
    section === "medicines"
      ? "/api/v1/categories?page=1&pageSize=100&sortBy=name&sortOrder=asc"
      : null,
    fetcher,
  );
  const { data: units } = useSWR<ListData>(
    section === "medicines"
      ? "/api/v1/units?page=1&pageSize=100&sortBy=name&sortOrder=asc"
      : null,
    fetcher,
  );
  const role = session?.user?.role ?? "cashier";
  const canWrite = config ? hasWrite(role, config.group) : false;
  const fields = useMemo(() => {
    if (!config) return [];
    return config.fields.map((field) => {
      if (field.key === "categoryId")
        return {
          ...field,
          options:
            categories?.items.map((item) => ({
              label: String(item.name),
              value: item.id,
            })) ?? [],
        };
      if (field.key === "unitId")
        return {
          ...field,
          options:
            units?.items.map((item) => ({
              label: String(item.name),
              value: item.id,
            })) ?? [],
        };
      return field;
    });
  }, [config, categories, units]);

  if (!config)
    return (
      <p
        role="alert"
        className="rounded-xl border border-[#f0d3cf] bg-white p-5 text-sm text-[#ad514c]"
      >
        This master-data page is not available.
      </p>
    );

  function openCreate() {
    setEditing(null);
    setSelectedUnitId("");
    setErrorMessage("");
    setSetupToken("");
    setNotice("");
    setFormVersion((value) => value + 1);
    setModalOpen(true);
  }

  // function openCreate() {
  //   setEditing(null);
  //   setErrorMessage("");
  //   setSetupToken("");
  //   setNotice("");
  //   setFormVersion((value) => value + 1);
  //   setModalOpen(true);
  // }
  // function openEdit(row: Row) {
  //   setEditing(row);
  //   setErrorMessage("");
  //   setSetupToken("");
  //   setNotice("");
  //   setFormVersion((value) => value + 1);
  //   setModalOpen(true);
  // }
  function openEdit(row: Row) {
    setEditing(row);
    setSelectedUnitId(String(row.unitId ?? ""));
    setErrorMessage("");
    setSetupToken("");
    setNotice("");
    setFormVersion((value) => value + 1);
    setModalOpen(true);
  }
  async function saveRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setSetupToken("");
    const values = new FormData(event.currentTarget);
    for (const field of config.fields) {
      if (field.key === "phone") {
        const phone = String(values.get("phone") ?? "").trim();

        if (!/^[0-9]{10}$/.test(phone)) {
          setErrorMessage("Phone number must contain exactly 10 digits.");
          setBusy(false);
          return;
        }
      }
    }
    const payload: Record<string, unknown> = {};
    for (const field of config.fields) {
      const raw = values.get(field.key);
      if (field.type === "checkbox")
        payload[field.apiKey ?? field.key] = raw === "on";
      else if (field.key === "dateOfBirth")
        payload[field.apiKey ?? field.key] = raw ? String(raw) : null;
      else if (field.key === "purchasePrice" || field.key === "sellingPrice")
        payload[field.apiKey!] = Math.round(Number(raw) * 100);
      else if (field.key === "gstRate")
        payload[field.apiKey!] = Math.round(Number(raw) * 100);
      else if (field.key === "stripSize") payload.stripSize = Number(raw || 1);
      else if (field.type === "number")
        payload[field.apiKey ?? field.key] = Number(raw);
      else payload[field.apiKey ?? field.key] = String(raw ?? "").trim();
    }
    try {
      const endpoint = editing
        ? `/api/v1/${section}/${editing.id}`
        : `/api/v1/${section}`;
      const response = await fetch(endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ApiData<{
        accountSetupToken?: string;
      }>;
      if (!response.ok)
        throw new Error(result.message || "Could not save this record");
      if (result.data?.accountSetupToken)
        setSetupToken(result.data.accountSetupToken);
      const singular =
        section === "patients"
          ? "Customer"
          : section === "users"
            ? "User"
            : section === "categories"
              ? "Category"
              : section === "medicines"
                ? "Medicine"
                : section === "suppliers"
                  ? "Supplier"
                  : section === "doctors"
                    ? "Doctor"
                    : "Unit";
      setNotice(`${singular} ${editing ? "updated" : "created"} successfully.`);
      await mutate();
      if (section !== "users" || editing || !result.data?.accountSetupToken)
        setModalOpen(false);
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error ? cause.message : "Could not save this record",
      );
    } finally {
      setBusy(false);
    }
  }

  async function issueSetupToken(row: Row) {
    setEditing(row);
    setSetupToken("");
    setErrorMessage("");
    setModalOpen(true);
    try {
      const response = await fetch(`/api/v1/users/${row.id}/setup-token`, {
        method: "POST",
      });
      const result = (await response.json()) as ApiData<{ setupToken: string }>;
      if (!response.ok)
        throw new Error(result.message || "Could not issue setup token");
      setSetupToken(result.data.setupToken);
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error ? cause.message : "Could not issue setup token",
      );
    }
  }

  async function deactivate(row: Row) {
    if (
      !window.confirm(
        `Deactivate ${String(row.name ?? row.email ?? "this record")}? Historical records will be preserved.`,
      )
    )
      return;
    setErrorMessage("");
    try {
      const response = await fetch(`/api/v1/${section}/${row.id}`, {
        method: "DELETE",
      });
      const result = (await response
        .json()
        .catch(() => null)) as ApiData<unknown> | null;
      if (!response.ok)
        throw new Error(result?.message || "Could not deactivate this record");
      setNotice("Record deactivated. Historical references are preserved.");
      await mutate();
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error
          ? cause.message
          : "Could not deactivate this record",
      );
    }
  }

  const totalPages = data?.pagination.totalPages ?? 0;
  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#218066]">
            Workspace data
          </p>
          <h1 className="text-[23px] font-semibold tracking-[-.04em] text-[#1d2e28]">
            {config.title}
          </h1>
          <p className="mt-1 text-xs text-[#87938e]">{config.description}</p>
        </div>
        {canWrite && (
          <button onClick={openCreate} className={buttonPrimary}>
            <Plus size={15} /> Add{" "}
            {section === "patients"
              ? "customer"
              : section === "users"
                ? "user"
                : section.slice(0, -1)}
          </button>
        )}
      </div>
      {notice && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-[#cfe9dc] bg-[#eff9f3] px-4 py-2.5 text-xs text-[#27775d]"
        >
          {notice}
        </div>
      )}
      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-[#f0d3cf] bg-[#fff5f3] px-4 py-2.5 text-xs text-[#ad514c]"
        >
          {errorMessage}
        </div>
      )}
      <section className={panel}>
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-[#e4ebe7] px-3">
            <Search size={15} className="text-[#95a19b]" />
            <span className="sr-only">Search {config.title}</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={`Search ${config.title.toLowerCase()}...`}
              className="w-full bg-transparent text-xs outline-none placeholder:text-[#a2ada8]"
            />
          </label>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
            className={`${inputClass} w-auto min-w-[140px]`}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-y border-[#edf1ef] bg-[#fafcfb]">
                {config.columns.map((column) => (
                  <th
                    key={column.key}
                    className="whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-[.06em] text-[#84918b]"
                  >
                    {column.label}
                  </th>
                ))}
                {canWrite && (
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[.06em] text-[#84918b]">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={config.columns.length + (canWrite ? 1 : 0)}
                    className="py-12 text-center text-xs text-[#7f8d86]"
                  >
                    <LoaderCircle
                      size={16}
                      className="mr-2 inline animate-spin"
                    />
                    Loading records…
                  </td>
                </tr>
              )}
              {error && !isLoading && (
                <tr>
                  <td
                    colSpan={config.columns.length + (canWrite ? 1 : 0)}
                    className="py-12 text-center text-xs text-[#ad514c]"
                  >
                    {error.message}
                  </td>
                </tr>
              )}
              {!isLoading &&
                !error &&
                (data?.items ?? []).map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#f0f3f1] last:border-0 hover:bg-[#fcfdfc]"
                  >
                    {config.columns.map((column) => (
                      <td
                        key={column.key}
                        className="whitespace-nowrap px-4 py-3 text-[11px] text-[#68766f]"
                      >
                        {column.key === "name" || column.key === "sku" ? (
                          <span className="font-semibold text-[#34443d]">
                            {formatCell(column.key, row[column.key])}
                          </span>
                        ) : (
                          formatCell(column.key, row[column.key])
                        )}
                      </td>
                    ))}
                    {canWrite && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setDetail(row)}
                            aria-label={`View ${String(row.name ?? row.email ?? "record")}`}
                            className="rounded-md p-1.5 text-[#83908a] hover:bg-[#edf5f1]"
                          >
                            <Search size={14} />
                          </button>
                          <button
                            onClick={() => openEdit(row)}
                            aria-label={`Edit ${String(row.name ?? row.email ?? "record")}`}
                            className="rounded-md p-1.5 text-[#83908a] hover:bg-[#edf5f1]"
                          >
                            <Settings2 size={14} />
                          </button>
                          {section === "users" &&
                            row.accountSetupRequired === true &&
                            row.status === "active" && (
                              <button
                                onClick={() => void issueSetupToken(row)}
                                aria-label={`Issue setup token for ${String(row.name ?? row.email)}`}
                                title="Issue setup token"
                                className="rounded-md p-1.5 text-[#83908a] hover:bg-[#edf5f1]"
                              >
                                <KeyRound size={14} />
                              </button>
                            )}
                          {row.status === "active" && (
                            <button
                              onClick={() => void deactivate(row)}
                              aria-label={`Deactivate ${String(row.name ?? row.email ?? "record")}`}
                              className="rounded-md p-1.5 text-[#83908a] hover:bg-[#fff5f3] hover:text-[#ad514c]"
                            >
                              <ShieldCheck size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              {!isLoading && !error && data?.items.length === 0 && (
                <tr>
                  <td
                    colSpan={config.columns.length + (canWrite ? 1 : 0)}
                    className="py-14 text-center text-xs text-[#909b96]"
                  >
                    No matching records. Try another search or filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 border-t border-[#edf1ef] px-4 py-3 text-[10px] text-[#8d9993] sm:flex-row sm:items-center sm:justify-between">
          <span>
            {data
              ? `${data.pagination.total} records · page ${data.pagination.page} of ${Math.max(totalPages, 1)}`
              : " "}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="rounded-md border border-[#e7ede9] p-1.5 disabled:opacity-40"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              className="rounded-md border border-[#e7ede9] p-1.5 disabled:opacity-40"
              onClick={() =>
                setPage((value) => Math.min(Math.max(totalPages, 1), value + 1))
              }
              disabled={!data || page >= Math.max(totalPages, 1)}
              aria-label="Next page"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </section>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setModalOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-dialog-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e6ece9] bg-white p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2
                  id="record-dialog-title"
                  className="text-base font-semibold text-[#24352d]"
                >
                  {editing
                    ? `Edit ${section === "patients" ? "customer" : section.slice(0, -1)}`
                    : `Add ${section === "patients" ? "customer" : section.slice(0, -1)}`}
                </h2>
                <p className="mt-1 text-[11px] text-[#929d98]">
                  Validated changes are saved to the local JSON store.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-[#7e8984] hover:bg-[#f2f6f4]"
              >
                <X size={17} />
              </button>
            </div>
            <form
              key={`${editing?.id ?? "new"}-${formVersion}`}
              onSubmit={saveRecord}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              {fields
                .filter(
                  (field) =>
                    field.key !== "stripSize" ||
                    units?.items.some(
                      (unit) =>
                        unit.id === selectedUnitId && unit.code === "STR",
                    ),
                )
                .map((field) => (
                  <label
                    key={field.key}
                    className={`flex flex-col gap-1.5 text-[10px] font-semibold text-[#5c6a63] ${
                      field.type === "checkbox"
                        ? "flex-row items-center justify-between rounded-lg border border-[#e7ede9] p-3"
                        : ""
                    }`}
                  >
                    {field.label}

                    {field.key === "stripSize" ? (
                      <input
                        type="number"
                        name="stripSize"
                        min="1"
                        step="1"
                        required
                        className={inputClass}
                        defaultValue={String(formValue(field, editing) || 1)}
                      />
                    ) : field.type === "select" ? (
                      <select
                        name={field.key}
                        className={inputClass}
                        required={field.required}
                        defaultValue={String(formValue(field, editing) || "")}
                        onChange={(event) => {
                          if (field.key === "unitId") {
                            setSelectedUnitId(event.target.value);
                          }
                        }}
                      >
                        <option value="">Select…</option>

                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : field.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        name={field.key}
                        className="size-4 accent-[#157a62]"
                        defaultChecked={Boolean(formValue(field, editing))}
                      />
                    ) : (
                      <input
                        type={
                          field.key === "phone" ? "tel" : (field.type ?? "text")
                        }
                        name={field.key}
                        className={inputClass}
                        required={field.required}
                        min={field.min}
                        step={field.step}
                        maxLength={field.maxLength}
                        inputMode={field.inputMode}
                        pattern={
                          field.key === "phone" ? "[0-9]{10}" : undefined
                        }
                        title={
                          field.key === "phone"
                            ? "Enter exactly 10 digits"
                            : undefined
                        }
                        defaultValue={String(formValue(field, editing) ?? "")}
                      />
                    )}
                  </label>
                ))}
              {/* {fields
                .filter(
                  (field) =>
                    field.key !== "stripSize" ||
                    units?.items.some(
                      (unit) =>
                        unit.id === selectedUnitId && unit.code === "STR",
                    ),
                )
                .map((field) => (
                  <label
                    key={field.key}
                    className={`flex flex-col gap-1.5 text-[10px] font-semibold text-[#5c6a63] ${field.type === "checkbox" ? "flex-row items-center justify-between rounded-lg border border-[#e7ede9] p-3" : ""}`}
                  >
                    {field.label}
                    {
                      field.type === "select" ? (
                        // <select
                        //   name={field.key}
                        //   className={inputClass}
                        //   required={field.required}
                        //   defaultValue={String(formValue(field, editing) || "")}
                        // >
                        //   <option value="">Select…</option>
                        //   {field.options?.map((option) => (
                        //     <option key={option.value} value={option.value}>
                        //       {option.label}
                        //     </option>
                        //   ))}
                        // </select>
                        <select
                          name={field.key}
                          className={inputClass}
                          required={field.required}
                          defaultValue={String(formValue(field, editing) || "")}
                          onChange={(event) =>
                            setSelectedUnitId(event.target.value)
                          }
                        >
                          <option value="">Select…</option>
                          {field.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "checkbox" ? (
                        <input
                          type="checkbox"
                          name={field.key}
                          className="size-4 accent-[#157a62]"
                          defaultChecked={Boolean(formValue(field, editing))}
                        />
                      ) : (
                        <input
                          type={
                            field.key === "phone"
                              ? "tel"
                              : (field.type ?? "text")
                          }
                          name={field.key}
                          className={inputClass}
                          required={field.required}
                          min={field.min}
                          step={field.step}
                          maxLength={field.maxLength}
                          inputMode={field.inputMode}
                          pattern={
                            field.key === "phone" ? "[0-9]{10}" : undefined
                          }
                          title={
                            field.key === "phone"
                              ? "Enter exactly 10 digits"
                              : undefined
                          }
                          defaultValue={String(formValue(field, editing) ?? "")}
                        />
                      )
                      // <input type={field.type ?? 'text'} name={field.key} className={inputClass} required={field.required} min={field.min} step={field.step} defaultValue={String(formValue(field, editing) ?? '')} />
                    }
                  </label>
                ))} */}
              {errorMessage && (
                <p
                  role="alert"
                  className="sm:col-span-2 rounded-lg border border-[#f0d3cf] bg-[#fff5f3] px-3 py-2 text-xs text-[#ad514c]"
                >
                  {errorMessage}
                </p>
              )}
              {setupToken && (
                <div className="sm:col-span-2 rounded-lg border border-[#d9e9de] bg-[#f3faf5] p-3 text-xs text-[#3b6650]">
                  <p className="font-semibold">One-time setup token</p>
                  <p className="mt-1 break-all font-mono">{setupToken}</p>
                  <p className="mt-1 text-[10px]">
                    Share this token privately with the user; it expires in 48
                    hours and is stored only as a hash.
                  </p>
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 font-semibold underline"
                    onClick={() =>
                      void navigator.clipboard?.writeText(setupToken)
                    }
                  >
                    <Check size={12} /> Copy token
                  </button>
                </div>
              )}
              <div className="sm:col-span-2 flex justify-end gap-2 border-t border-[#edf1ef] pt-4">
                <button
                  type="button"
                  className={buttonSecondary}
                  onClick={() => setModalOpen(false)}
                  disabled={busy}
                >
                  Close
                </button>
                <button type="submit" className={buttonPrimary} disabled={busy}>
                  {busy && <LoaderCircle size={14} className="animate-spin" />}
                  {editing ? "Save changes" : "Create record"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetail(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-detail-title"
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[#e6ece9] bg-white p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2
                  id="record-detail-title"
                  className="text-base font-semibold text-[#24352d]"
                >
                  {String(detail.name ?? detail.email ?? detail.id)}
                </h2>
                <p className="mt-1 text-[11px] text-[#929d98]">
                  {config.title} · Stored profile fields
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                aria-label="Close details"
                className="rounded-lg p-1.5 text-[#7e8984] hover:bg-[#f2f6f4]"
              >
                <X size={17} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(detail)
                .filter(([key]) => !["id"].includes(key))
                .map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-[#f8faf9] px-3 py-2">
                    <p className="text-[9px] font-medium capitalize text-[#98a29d]">
                      {key.replace(
                        /[A-Z]/g,
                        (letter) => ` ${letter.toLowerCase()}`,
                      )}
                    </p>
                    <p className="mt-1 break-words text-[11px] font-semibold text-[#45544c]">
                      {formatCell(key, value)}
                    </p>
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
