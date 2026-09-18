import mongoose from "mongoose";

const CryptoAnalysisSchema = new mongoose.Schema(
  {
    coin: { type: String, required: true, trim: true },
    symbol: { type: String, required: true, trim: true, uppercase: true },
    network: { type: String, trim: true },
    title: { type: String, required: true, trim: true },

    referencePrice: { type: String, trim: true },
    entryZone: { type: String, trim: true },
    target1: { type: String, trim: true },
    target2: { type: String, trim: true },
    target3: { type: String, trim: true },
    invalidation: { type: String, trim: true }, // stop loss / invalidation level
    timeframe: { type: String, trim: true },

    marketThesis: { type: String, trim: true },
    technicalAnalysis: { type: String, trim: true },
    fundamentalNotes: { type: String, trim: true },

    riskLevel: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], default: "MEDIUM" },
    chartImage: { type: String, trim: true },

    status: {
      type: String,
      enum: [
        "ANALYSIS",
        "SIGNAL",
        "ACTIVE",
        "TP1_HIT",
        "TP2_HIT",
        "TP3_HIT",
        "WON",
        "LOST",
        "CANCELLED",
        "CLOSED"
      ],
      default: "ANALYSIS"
    },

    published: { type: Boolean, default: false },
    publishedAt: { type: Date }
  },
  { timestamps: true }
);

CryptoAnalysisSchema.index({ published: 1, createdAt: -1 });
CryptoAnalysisSchema.index({ status: 1 });
CryptoAnalysisSchema.index({ symbol: 1 });

export default mongoose.models.CryptoAnalysis ||
  mongoose.model("CryptoAnalysis", CryptoAnalysisSchema);
