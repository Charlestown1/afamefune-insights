import mongoose from "mongoose";

/**
 * Singleton document (there is only ever one). Holds branding, Telegram
 * links, the BNB donation address, and other site-wide config so nothing
 * is hardcoded across multiple frontend files.
 */
const SiteSettingsSchema = new mongoose.Schema(
  {
    singleton: { type: String, unique: true, default: "singleton" },

    siteName: { type: String, default: "MMUO" },
    siteDescription: {
      type: String,
      default:
        "MMUO is an independent forex and crypto market analysis platform."
    },
    contactEmail: { type: String, default: "" },
    footerText: { type: String, default: "" },
    socialLinks: { type: String, default: "" },

    telegramChannelUrl: { type: String, default: "" },
    telegramGroupUrl: { type: String, default: "" },
    telegramBlurb: {
      type: String,
      default:
        "Join the MMUO Telegram community for additional signals and market updates."
    },

    bnbDonationAddress: {
      type: String,
      default: "0x1B7f1D6AFa15979C40564e7cc66084082c7483C1"
    },
    donationBlurb: {
      type: String,
      default: "Support our independent market research and analysis."
    },

    defaultDisclaimer: {
      type: String,
      default:
        "All content on MMUO is provided for informational and educational purposes only and does not constitute financial advice. Trading forex and investing in cryptocurrency involve significant risk, including the potential loss of your entire investment. Past performance does not guarantee future results. MMUO does not guarantee profits or accuracy of any analysis. Always conduct your own research and consult a licensed financial advisor before making investment decisions."
    },

    announcementBannerText: { type: String, default: "" },
    announcementBannerActive: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.models.SiteSettings ||
  mongoose.model("SiteSettings", SiteSettingsSchema);
