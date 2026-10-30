import mongoose from "mongoose";

const systemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export const SystemSetting = mongoose.model("SystemSetting", systemSettingSchema);
