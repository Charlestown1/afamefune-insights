"use client";

import { useEffect, useState } from "react";

const FIELD_GROUPS = [
  {
    title: "Branding",
    fields: [
      { name: "siteName", label: "Website Name", type: "text" },
      { name: "siteDescription", label: "Site Description", type: "textarea" },
      { name: "contactEmail", label: "Contact Email", type: "text" },
      { name: "footerText", label: "Footer Text", type: "text" },
      { name: "socialLinks", label: "Social Links (comma-separated)", type: "text" }
    ]
  },
  {
    title: "Telegram",
    fields: [
      { name: "telegramChannelUrl", label: "Telegram Channel URL", type: "text" },
      { name: "telegramGroupUrl", label: "Telegram Group URL", type: "text" },
      { name: "telegramBlurb", label: "Telegram Section Blurb", type: "textarea" }
    ]
  },
  {
    title: "BNB Donations",
    fields: [
      { name: "bnbDonationAddress", label: "BNB Donation Address (BEP-20)", type: "text" },
      { name: "donationBlurb", label: "Donation Blurb", type: "textarea" }
    ]
  },
  {
    title: "Announcement Banner",
    fields: [
      { name: "announcementBannerActive", label: "Show banner site-wide", type: "checkbox" },
      { name: "announcementBannerText", label: "Banner Text", type: "text" }
    ]
  },
  {
    title: "Disclaimer",
    fields: [
      { name: "defaultDisclaimer", label: "Default Disclaimer", type: "textarea" }
    ]
  }
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => setSettings(data.settings));
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      setSettings(data.settings);
      setMessage("Saved.");
      setTimeout(() => setMessage(""), 2500);
    } else {
      setMessage(data.error || "Save failed.");
    }
  }

  if (!settings) {
    return <div className="text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold text-gray-50">Site Settings</h1>

      {message ? (
        <div className="mb-4 rounded-md border border-gold-500/40 bg-gold-500/10 px-3 py-2 text-sm text-gold-400">
          {message}
        </div>
      ) : null}

      <form onSubmit={handleSave} className="space-y-8">
        {FIELD_GROUPS.map((group) => (
          <div key={group.title} className="card p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gold-500">
              {group.title}
            </h2>
            <div className="space-y-4">
              {group.fields.map((f) => (
                <div key={f.name}>
                  {f.type === "checkbox" ? (
                    <label className="flex items-center gap-2 text-sm text-gray-200">
                      <input
                        type="checkbox"
                        checked={!!settings[f.name]}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, [f.name]: e.target.checked }))
                        }
                      />
                      {f.label}
                    </label>
                  ) : f.type === "textarea" ? (
                    <div>
                      <label className="label">{f.label}</label>
                      <textarea
                        className="input min-h-[90px]"
                        value={settings[f.name] || ""}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, [f.name]: e.target.value }))
                        }
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="label">{f.label}</label>
                      <input
                        className="input"
                        value={settings[f.name] || ""}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, [f.name]: e.target.value }))
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <button type="submit" disabled={saving} className="btn-gold disabled:opacity-60">
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
