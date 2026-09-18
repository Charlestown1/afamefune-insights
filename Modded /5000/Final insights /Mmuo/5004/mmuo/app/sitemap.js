import { connectDB } from "@/lib/db";
import ForexAnalysis from "@/lib/models/ForexAnalysis";
import CryptoAnalysis from "@/lib/models/CryptoAnalysis";

export default async function sitemap() {
  const base = process.env.PUBLIC_URL || "https://mmuo.onrender.com";

  const staticRoutes = [
    "", "/forex", "/crypto", "/gems", "/results", "/about", "/telegram", "/donate"
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date()
  }));

  try {
    await connectDB();
    const [forex, crypto] = await Promise.all([
      ForexAnalysis.find({ published: true }).select("_id updatedAt").limit(500).lean(),
      CryptoAnalysis.find({ published: true }).select("_id updatedAt").limit(500).lean()
    ]);

    const dynamicRoutes = [
      ...forex.map((f) => ({ url: `${base}/forex/${f._id}`, lastModified: f.updatedAt })),
      ...crypto.map((c) => ({ url: `${base}/crypto/${c._id}`, lastModified: c.updatedAt }))
    ];

    return [...staticRoutes, ...dynamicRoutes];
  } catch {
    return staticRoutes;
  }
}
