"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/dashboard/forex", label: "Forex" },
  { href: "/admin/dashboard/crypto", label: "Crypto" },
  { href: "/admin/dashboard/gems", label: "Gems" },
  { href: "/admin/dashboard/ads", label: "Advertisements" },
  { href: "/admin/dashboard/announcements", label: "Announcements" },
  { href: "/admin/dashboard/settings", label: "Site Settings" }
];

export default function DashboardNav({ mobile }) {
  const pathname = usePathname();

  return (
    <nav className={mobile ? "flex flex-wrap gap-2" : "space-y-1 p-3"}>
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              mobile
                ? `rounded px-3 py-1.5 text-xs font-medium ${
                    active ? "bg-gold-500 text-ink-950" : "bg-ink-800 text-gray-300"
                  }`
                : `block rounded-md px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-gold-500/15 text-gold-400"
                      : "text-gray-300 hover:bg-ink-800 hover:text-gray-100"
                  }`
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
