import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: { type: String, enum: ["credit", "debit", "refund"], required: true },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "completed" },
    amountUzs: { type: Number, required: true },
    balanceBeforeUzs: { type: Number, required: true },
    balanceAfterUzs: { type: Number, required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    topUp: { type: mongoose.Schema.Types.ObjectId, ref: "TopUp" },
    note: { type: String, default: "" },
    sourceKey: { type: String, sparse: true, unique: true, index: true },
  },
  { timestamps: true },
);

export const Transaction = mongoose.model("Transaction", transactionSchema);
