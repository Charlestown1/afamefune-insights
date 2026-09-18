"use client";

import AdminCrudManager from "@/components/admin/AdminCrudManager";

const STATUS_OPTIONS = [
  "ANALYSIS", "SIGNAL", "ACTIVE", "TP1_HIT", "TP2_HIT", "TP3_HIT",
  "WON", "LOST", "CANCELLED", "CLOSED"
];

const fields = [
  { name: "coin", label: "Coin Name (e.g. Bitcoin)", type: "text", required: true },
  { name: "symbol", label: "Symbol (e.g. BTC)", type: "text", required: true },
  { name: "network", label: "Network", type: "text" },
  { name: "title", label: "Analysis Title", type: "text", required: true, wide: true },
  { name: "referencePrice", label: "Current Reference Price", type: "text" },
  { name: "entryZone", label: "Entry Zone", type: "text" },
  { name: "target1", label: "Target 1", type: "text" },
  { name: "target2", label: "Target 2", type: "text" },
  { name: "target3", label: "Target 3", type: "text" },
  { name: "invalidation", label: "Stop Loss / Invalidation", type: "text" },
  { name: "timeframe", label: "Timeframe", type: "text" },
  { name: "riskLevel", label: "Risk Level", type: "select", options: ["LOW", "MEDIUM", "HIGH"], required: true },
  { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, required: true },
  { name: "chartImage", label: "Chart Image", type: "image", wide: true },
  { name: "marketThesis", label: "Market Thesis", type: "textarea", wide: true },
  { name: "technicalAnalysis", label: "Technical Analysis", type: "textarea", wide: true },
  { name: "fundamentalNotes", label: "Fundamental / Project Notes", type: "textarea", wide: true },
  { name: "published", label: "Published (visible on public site)", type: "checkbox" }
];

const columns = [
  { key: "coin", label: "Coin" },
  { key: "symbol", label: "Symbol" },
  { key: "status", label: "Status" },
  { key: "riskLevel", label: "Risk" }
];

export default function AdminCryptoPage() {
  return (
    <AdminCrudManager
      endpoint="/api/crypto"
      title="Crypto Analysis"
      fields={fields}
      columns={columns}
      emptyLabel="No crypto analyses yet. Click 'Create New' to publish your first one."
    />
  );
}
