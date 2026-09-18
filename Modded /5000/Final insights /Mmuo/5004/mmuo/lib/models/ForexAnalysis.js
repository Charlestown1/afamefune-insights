import mongoose from "mongoose";

const ForexAnalysisSchema = new mongoose.Schema(
  {
    pair: { type: String, required: true, trim: true, uppercase: true }, // e.g. EUR/USD, custom allowed
    direction: { type: String, enum: ["BUY", "SELL"], required: true },
    title: { type: String, required: true, trim: true },

    entry: { type: String, trim: true }, // string to allow "1.3500" or a zone "1.3480-1.3520"
    stopLoss: { type: String, trim: true },
    takeProfit1: { type: String, trim: true },
    takeProfit2: { type: String, trim: true },
    takeProfit3: { type: String, trim: true },
    riskReward: { type: String, trim: true },
    timeframe: { type: String, trim: true }, // e.g. 4H, 1D

    marketStructure: { type: String, trim: true },
    technicalAnalysis: { type: String, trim: true },
    fundamentalContext: { type: String, trim: true },
    keySupportLevels: { type: String, trim: true },
    keyResistanceLevels: { type: String, trim: true },
    tradeSetupExplanation: { type: String, trim: true },
    riskWarning: {
      type: String,
      trim: true,
      default:
        "This is market analysis for educational purposes only, not financial advice. Trading forex carries significant risk."
    },

    chartImage: { type: String, trim: true }, // uploaded image path

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

ForexAnalysisSchema.index({ published: 1, createdAt: -1 });
ForexAnalysisSchema.index({ status: 1 });
ForexAnalysisSchema.index({ pair: 1 });

export default mongoose.models.ForexAnalysis ||
  mongoose.model("ForexAnalysis", ForexAnalysisSchema);
