"use client";

import { useEffect, useState } from "react";
import ImageUploadField from "./ImageUploadField";

/**
 * Generic admin CRUD screen driven by a field config, reused for Forex,
 * Crypto, Gems, Ads, and Announcements. Each field: { name, label, type,
 * options?, required?, help? } where type is one of:
 * text | number | textarea | select | checkbox | date | image
 */
export default function AdminCrudManager({
  endpoint,
  title,
  fields,
  columns,
  emptyLabel,
  statusField = "published",
  statusLabels = { on: "PUBLISHED", off: "DRAFT" }
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...item} = edit
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch(`${endpoint}?all=true`, { cache: "no-store" });
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  function openCreate() {
    const defaults = {};
    fields.forEach((f) => {
      defaults[f.name] = f.type === "checkbox" ? false : "";
    });
    setEditing(defaults);
    setError("");
  }

  function openEdit(item) {
    setEditing({ ...item });
    setError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const isNew = !editing._id;
    const url = isNew ? endpoint : `${endpoint}/${editing._id}`;
    const method = isNew ? "POST" : "PUT";
    const payload = { ...editing };
    delete payload._id;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.__v;

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed.");
        setSaving(false);
        return;
      }
      setEditing(null);
      await load();
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!confirm(`Delete "${item.title || item.name || item.pair || item.coin || "this item"}"? This cannot be undone.`)) {
      return;
    }
    await fetch(`${endpoint}/${item._id}`, { method: "DELETE" });
    await load();
  }

  async function togglePublished(item) {
    await fetch(`${endpoint}/${item._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [statusField]: !item[statusField] })
    });
    await load();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-gray-50">{title}</h1>
        <button onClick={openCreate} className="btn-gold">+ Create New</button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : items.length ? (
        <div className="table-wrap">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-ink-800 text-xs uppercase text-gray-400">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3">{col.label}</th>
                ))}
                <th className="px-4 py-3">{statusLabels.on}?</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {items.map((item) => (
                <tr key={item._id}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-gray-200">
                      {col.render ? col.render(item) : String(item[col.key] ?? "—")}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => togglePublished(item)}
                      className={`rounded px-2 py-1 text-xs font-bold ${
                        item[statusField] ? "bg-up/15 text-up" : "bg-ink-700 text-gray-400"
                      }`}
                    >
                      {item[statusField] ? statusLabels.on : statusLabels.off}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button onClick={() => openEdit(item)} className="mr-3 text-xs font-medium text-gold-500 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(item)} className="text-xs font-medium text-down hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card p-10 text-center text-sm text-gray-500">
          {emptyLabel || "Nothing here yet."}
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 py-10">
          <div className="card w-full max-w-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-gray-50">
                {editing._id ? "Edit" : "Create"} {title}
              </h2>
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-200">✕</button>
            </div>

            {error ? (
              <div className="mb-4 rounded-md border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.name} className={f.wide ? "sm:col-span-2" : ""}>
                  <FieldInput
                    field={f}
                    value={editing[f.name]}
                    onChange={(val) => setEditing((prev) => ({ ...prev, [f.name]: val }))}
                  />
                </div>
              ))}

              <div className="sm:col-span-2 flex items-center gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn-gold disabled:opacity-60">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={() => setEditing(null)} className="btn-outline">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FieldInput({ field, value, onChange }) {
  const { type, label, options, required, help } = field;

  if (type === "checkbox") {
    return (
      <label className="flex items-center gap-2 pt-6 text-sm text-gray-200">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    );
  }

  if (type === "textarea") {
    return (
      <div>
        <label className="label">{label}</label>
        <textarea
          className="input min-h-[100px]"
          required={required}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
        {help ? <p className="mt-1 text-xs text-gray-500">{help}</p> : null}
      </div>
    );
  }

  if (type === "select") {
    return (
      <div>
        <label className="label">{label}</label>
        <select className="input" required={required} value={value || ""} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>Select…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt.replace(/_/g, " ")}</option>
          ))}
        </select>
        {help ? <p className="mt-1 text-xs text-gray-500">{help}</p> : null}
      </div>
    );
  }

  if (type === "image") {
    return <ImageUploadField label={label} value={value} onChange={onChange} />;
  }

  if (type === "date") {
    return (
      <div>
        <label className="label">{label}</label>
        <input
          type="date"
          className="input"
          value={value ? String(value).slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div>
      <label className="label">{label}</label>
      <input
        type={type === "number" ? "number" : "text"}
        className="input"
        required={required}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {help ? <p className="mt-1 text-xs text-gray-500">{help}</p> : null}
    </div>
  );
}
