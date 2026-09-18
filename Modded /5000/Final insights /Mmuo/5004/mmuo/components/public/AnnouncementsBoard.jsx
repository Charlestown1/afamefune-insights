import { connectDB } from "@/lib/db";
import Announcement from "@/lib/models/Announcement";

export default async function AnnouncementsBoard() {
  await connectDB();
  const items = await Announcement.find({ active: true }).sort({ createdAt: -1 }).limit(5).lean();
  if (!items.length) return null;

  return (
    <div className="container-mmuo -mt-6 mb-6">
      <div className="card divide-y divide-ink-800">
        {items.map((a) => (
          <div key={a._id} className="flex items-start gap-3 px-4 py-3 text-sm">
            <span className="mt-0.5 text-gold-500">●</span>
            <span className="text-gray-300">{a.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
