"use client";

import AdminCrudManager from "@/components/admin/AdminCrudManager";

const fields = [
  { name: "message", label: "Message", type: "textarea", required: true, wide: true },
  { name: "active", label: "Active", type: "checkbox" }
];

const columns = [
  { key: "message", label: "Message", render: (item) => item.message?.slice(0, 80) }
];

export default function AdminAnnouncementsPage() {
  return (
    <AdminCrudManager
      endpoint="/api/announcements"
      title="Announcements"
      fields={fields}
      columns={columns}
      emptyLabel="No announcements yet."
      statusField="active"
      statusLabels={{ on: "ACTIVE", off: "INACTIVE" }}
    />
  );
}
