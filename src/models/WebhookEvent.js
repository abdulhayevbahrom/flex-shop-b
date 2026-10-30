import mongoose from "mongoose";

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    event: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const WebhookEvent = mongoose.model("WebhookEvent", webhookEventSchema);
