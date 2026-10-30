import mongoose from "mongoose";

const topUpSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amountUzs: { type: Number, required: true, min: 1 },
    requestedAmountUzs: { type: Number, required: true, min: 1 },
    paymentCode: { type: Number, required: true, min: 0 },
    activeAmountKey: { type: String, unique: true, sparse: true, index: true },
    purpose: { type: String, enum: ["balance", "order"], default: "balance" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", index: true },
    method: { type: String, default: "manual_card" },
    paymentCard: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentCard" },
    status: {
      type: String,
      enum: ["pending", "reviewing", "completed", "rejected", "expired"],
      default: "pending",
      index: true,
    },
    cardLabel: String,
    cardNumber: String,
    cardHolder: String,
    expiresAt: { type: Date, required: true },
    completedAt: Date,
    matchedNotification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentNotification",
    },
  },
  { timestamps: true },
);

export const TopUp = mongoose.model("TopUp", topUpSchema);
