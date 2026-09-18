import { redirect } from "next/navigation";
import { verifyAdminSession } from "@/lib/auth";
import LogoutButton from "@/components/admin/LogoutButton";
import DashboardNav from "@/components/admin/DashboardNav";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminDashboardLayout({ children }) {
  // Defense in depth: middleware.js already blocks unauthenticated requests
  // to everything under /admin/dashboard, but this route segment checks the
  // real session again server-side rather than trusting that alone.
  const session = await verifyAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="flex min-h-screen bg-ink-950">
      <aside className="hidden w-60 flex-shrink-0 border-r border-ink-700 bg-ink-900 md:block">
        <div className="border-b border-ink-700 p-5">
          <div className="font-display text-lg font-bold text-gray-50">MMUO</div>
          <div className="text-xs uppercase tracking-widest text-gray-500">Admin</div>
        </div>
        <DashboardNav />
        <div className="border-t border-ink-700 p-4">
          <div className="mb-3 truncate text-xs text-gray-500">{session.email}</div>
          <LogoutButton />
        </div>
      </aside>

      <div className="flex-1">
        <div className="border-b border-ink-700 bg-ink-900 p-4 md:hidden">
          <DashboardNav mobile />
        </div>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
