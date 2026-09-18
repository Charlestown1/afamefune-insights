import { connectDB } from "./db";
import SiteSettings from "./models/SiteSettings";

export async function getSiteSettings() {
  await connectDB();
  let settings = await SiteSettings.findOne({ singleton: "singleton" });
  if (!settings) {
    settings = await SiteSettings.create({ singleton: "singleton" });
  }
  return settings;
}
