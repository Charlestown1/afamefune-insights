"use client";

import AdminCrudManager from "@/components/admin/AdminCrudManager";

const PLACEMENTS = [
  "HOMEPAGE", "FOREX_PAGE", "CRYPTO_PAGE", "GEMS_PAGE",
  "BETWEEN_CARDS", "SIDEBAR", "TOP_BANNER", "BOTTOM_BANNER"
];

const fields = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "brandName", label: "Brand Name", type: "text" },
  { name: "destinationUrl", label: "Destination URL", type: "text", wide: true },
  { name: "image", label: "Banner Image", type: "image", wide: true },
  { name: "description", label: "Description", type: "textarea", wide: true },
  { name: "placement", label: "Placement", type: "select", options: PLACEMENTS, required: true },
  { name: "priority", label: "Priority (higher shows first)", type: "number" },
  { name: "startDate", label: "Start Date", type: "date" },
  { name: "endDate", label: "End Date", type: "date" },
  { name: "active", label: "Active", type: "checkbox" }
];

const columns = [
  { key: "title", label: "Title" },
  { key: "placement", label: "Placement" },
  { key: "priority", label: "Priority" }
];

export default function AdminAdsPage() {
  return (
    <AdminCrudManager
      endpoint="/api/ads"
      title="Advertisements"
      fields={fields}
      columns={columns}
      emptyLabel="No advertisements yet."
      statusField="active"
      statusLabels={{ on: "ACTIVE", off: "INACTIVE" }}
    />
  );
}
