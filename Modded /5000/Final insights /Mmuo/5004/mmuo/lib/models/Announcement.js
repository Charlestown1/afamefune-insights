import mongoose from "mongoose";

const AnnouncementSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

AnnouncementSchema.index({ active: 1, createdAt: -1 });

export default mongoose.models.Announcement ||
  mongoose.model("Announcement", AnnouncementSchema);
