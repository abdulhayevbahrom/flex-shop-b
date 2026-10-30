import mongoose from "mongoose";

const packageSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["lootbar", "fragment"], default: "lootbar", required: true, index: true },
    type: {
      type: String,
      enum: ["pubg_uc", "telegram_premium"],
      required: true,
      index: true,
    },
    providerProductId: { type: String, required: true, trim: true },
    providerCategoryId: { type: String, trim: true, default: "" },
    name: { type: String, required: true, trim: true },
    providerPriceUsd: { type: mongoose.Schema.Types.Decimal128, required: true },
    retailPriceUzs: { type: Number, required: true, min: 0 },
    visible: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    providerUpdatedAt: Date,
  },
  { timestamps: true },
);

packageSchema.index({ type: 1, providerProductId: 1 }, { unique: true });

export const Package = mongoose.model("Package", packageSchema);
