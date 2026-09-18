"use client";

import { useState } from "react";

export default function ImageUploadField({ label, value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed.");
      } else {
        onChange(data.url);
      }
    } catch {
      setError("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="label">{label}</label>
      {value ? (
        <div className="mb-2 flex items-center gap-3">
          <img src={value} alt="" className="h-16 w-16 rounded-md border border-ink-600 object-cover" />
          <button type="button" onClick={() => onChange("")} className="text-xs text-down hover:underline">
            Remove
          </button>
        </div>
      ) : null}
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFile} className="input" />
      {uploading ? <p className="mt-1 text-xs text-gray-500">Uploading…</p> : null}
      {error ? <p className="mt-1 text-xs text-down">{error}</p> : null}
    </div>
  );
}
