"use client";

import AdminCrudManager from "@/components/admin/AdminCrudManager";

const fields = [
  { name: "name", label: "Coin Name", type: "text", required: true },
  { name: "symbol", label: "Symbol", type: "text", required: true },
  { name: "contractAddress", label: "Contract Address", type: "text", wide: true },
  { name: "network", label: "Blockchain / Network", type: "text" },
  { name: "referencePrice", label: "Entry / Reference Price", type: "text" },
  { name: "targetZones", label: "Target Zones", type: "text" },
  { name: "invalidation", label: "Invalidation Level", type: "text" },
  { name: "marketCap", label: "Market Cap", type: "text" },
  { name: "liquidity", label: "Liquidity", type: "text" },
  { name: "riskLevel", label: "Risk Level", type: "select", options: ["LOW", "MEDIUM", "HIGH"], required: true },
  { name: "status", label: "Status", type: "select", options: ["WATCH", "ACTIVE", "TARGET_HIT", "CLOSED", "INVALIDATED"], required: true },
  { name: "logo", label: "Logo", type: "image" },
  { name: "website", label: "Website URL", type: "text" },
  { name: "dexLink", label: "DEX Link", type: "text" },
  { name: "chartLink", label: "Chart Link", type: "text" },
  { name: "socialLinks", label: "Social Links", type: "text", wide: true, help: "Comma-separated URLs" },
  { name: "description", label: "Token Description", type: "textarea", wide: true },
  { name: "thesis", label: "Why It's Interesting", type: "textarea", wide: true },
  { name: "published", label: "Published (visible on public site)", type: "checkbox" }
];

const columns = [
  { key: "name", label: "Name" },
  { key: "symbol", label: "Symbol" },
  { key: "status", label: "Status" },
  { key: "riskLevel", label: "Risk" }
];

export default function AdminGemsPage() {
  return (
    <AdminCrudManager
      endpoint="/api/gems"
      title="Crypto Gems"
      fields={fields}
      columns={columns}
      emptyLabel="No gems yet. Click 'Create New' to highlight your first opportunity."
    />
  );
}
