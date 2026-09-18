import mongoose from "mongoose";

const AdvertisementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    image: { type: String, trim: true },
    brandName: { type: String, trim: true },
    destinationUrl: { type: String, trim: true },

    startDate: { type: Date },
    endDate: { type: Date },
    active: { type: Boolean, default: true },

    placement: {
      type: String,
      enum: [
        "HOMEPAGE",
        "FOREX_PAGE",
        "CRYPTO_PAGE",
        "GEMS_PAGE",
        "BETWEEN_CARDS",
        "SIDEBAR",
        "TOP_BANNER",
        "BOTTOM_BANNER"
      ],
      default: "HOMEPAGE"
    },
    priority: { type: Number, default: 0 }
  },
  { timestamps: true }
);

AdvertisementSchema.index({ active: 1, placement: 1, priority: -1 });

export default mongoose.models.Advertisement ||
  mongoose.model("Advertisement", AdvertisementSchema);
