import { connectDB } from "@/lib/db";
import Advertisement from "@/lib/models/Advertisement";

async function fetchAds(placement) {
  try {
    await connectDB();
    const now = new Date();
    const ads = await Advertisement.find({
      active: true,
      placement,
      $and: [
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $gte: now } }] }
      ]
    })
      .sort({ priority: -1, createdAt: -1 })
      .limit(1)
      .lean();
    return ads;
  } catch {
    return [];
  }
}

export default async function AdSlot({ placement }) {
  const ads = await fetchAds(placement);
  if (!ads.length) return null;
  const ad = ads[0];

  return (
    <div className="container-mmuo my-10">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-600">Advertisement</div>
      <a
        href={ad.destinationUrl || "#"}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="card flex items-center gap-4 overflow-hidden p-4 transition hover:border-gold-500/50"
      >
        {ad.image ? (
          <img src={ad.image} alt={ad.title} className="h-16 w-16 flex-shrink-0 rounded-md object-cover" />
        ) : null}
        <div>
          <div className="font-semibold text-gray-100">{ad.title}</div>
          {ad.brandName ? <div className="text-xs text-gold-500">{ad.brandName}</div> : null}
          {ad.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-gray-400">{ad.description}</p>
          ) : null}
        </div>
      </a>
    </div>
  );
}
