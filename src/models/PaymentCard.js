import mongoose from "mongoose";

const paymentCardSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 60 },
    number: { type: String, required: true, unique: true, trim: true },
    holder: { type: String, required: true, trim: true, maxlength: 100 },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

paymentCardSchema.index({ active: 1, usageCount: 1, sortOrder: 1 });

export const PaymentCard = mongoose.model("PaymentCard", paymentCardSchema);
