import mongoose from "mongoose";

const CryptoGemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    symbol: { type: String, required: true, trim: true, uppercase: true },
    contractAddress: { type: String, trim: true },
    network: { type: String, trim: true },

    referencePrice: { type: String, trim: true },
    targetZones: { type: String, trim: true },
    invalidation: { type: String, trim: true },
    marketCap: { type: String, trim: true },
    liquidity: { type: String, trim: true },

    description: { type: String, trim: true },
    thesis: { type: String, trim: true }, // "why it's interesting"
    riskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], default: "HIGH" },

    website: { type: String, trim: true },
    dexLink: { type: String, trim: true },
    chartLink: { type: String, trim: true },
    socialLinks: { type: String, trim: true }, // comma-separated or freeform

    logo: { type: String, trim: true },

    status: {
      type: String,
      enum: ["WATCH", "ACTIVE", "TARGET_HIT", "CLOSED", "INVALIDATED"],
      default: "WATCH"
    },

    published: { type: Boolean, default: false },
    dateAdded: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

CryptoGemSchema.index({ published: 1, createdAt: -1 });
CryptoGemSchema.index({ status: 1 });

export default mongoose.models.CryptoGem ||
  mongoose.model("CryptoGem", CryptoGemSchema);
