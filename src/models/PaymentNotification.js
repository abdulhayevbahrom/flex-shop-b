import mongoose from "mongoose";

const paymentNotificationSchema = new mongoose.Schema(
  {
    telegramMessageId: { type: String, required: true, unique: true, index: true },
    telegramChatId: { type: String, required: true },
    senderUsername: { type: String, required: true, lowercase: true },
    direction: { type: String, enum: ["credit", "debit", "unknown"], required: true },
    amountUzs: { type: Number, min: 0 },
    text: { type: String, required: true },
    status: {
      type: String,
      enum: ["received", "ignored", "matched", "unmatched", "error"],
      default: "received",
      index: true,
    },
    topUp: { type: mongoose.Schema.Types.ObjectId, ref: "TopUp" },
    reason: { type: String, default: "" },
    telegramDate: Date,
  },
  { timestamps: true },
);

export const PaymentNotification = mongoose.model(
  "PaymentNotification",
  paymentNotificationSchema,
);
