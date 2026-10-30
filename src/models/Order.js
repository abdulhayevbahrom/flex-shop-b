import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    provider: { type: String, enum: ["lootbar", "fragment"], default: "lootbar", required: true },
    providerOrderId: { type: String, sparse: true, index: true },
    providerReferenceId: { type: String, sparse: true, index: true },
    type: { type: String, enum: ["pubg_uc", "telegram_premium"], required: true },
    status: {
      type: String,
      enum: [
        "awaiting_payment",
        "created",
        "processing",
        "partial",
        "manual_review",
        "completed",
        "failed",
        "refunded",
        "cancelled",
      ],
      default: "created",
      index: true,
    },
    product: {
      categoryId: String,
      offerId: String,
      title: String,
      quantity: Number,
      months: Number,
    },
    recipient: {
      playerId: String,
      playerName: String,
      telegramUsername: String,
    },
    costUsd: { type: mongoose.Schema.Types.Decimal128, required: true },
    chargedUzs: { type: Number, required: true, min: 0 },
    paymentAmountUzs: { type: Number, min: 0 },
    paymentExpiresAt: Date,
    paidAt: Date,
    topUp: { type: mongoose.Schema.Types.ObjectId, ref: "TopUp" },
    providerPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    failureReason: { type: String, default: "" },
    refundedAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

orderSchema.index({ status: 1, completedAt: -1 });
orderSchema.index({ createdAt: -1 });

export const Order = mongoose.model("Order", orderSchema);
