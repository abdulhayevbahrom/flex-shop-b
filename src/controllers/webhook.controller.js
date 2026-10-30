import crypto from "node:crypto";
import { Order } from "../models/Order.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { WebhookEvent } from "../models/WebhookEvent.js";
import { getCallbackKey, mapLootbarState } from "../services/lootbar.service.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function verifySignature(req, rawBody) {
  const key = await getCallbackKey();
  const signature = req.header("X-Inner-Authorization");
  if (!key || !signature) return false;
  const content = `POST${req.originalUrl}${rawBody.toString("utf8")}${key}`;
  return safeEqual(signature, crypto.createHash("sha1").update(content).digest("hex"));
}

async function refundOrder(order, reason) {
  const previous = await Order.findOneAndUpdate(
    { _id: order._id, status: { $nin: ["failed", "refunded", "cancelled"] } },
    { $set: { status: "refunded", refundedAt: new Date(), failureReason: reason } },
    { new: false },
  );
  if (!previous) return;
  const amount = previous.paymentAmountUzs ?? previous.chargedUzs;
  const user = await User.findByIdAndUpdate(previous.user, { $inc: { balanceUzs: amount } }, { new: true });
  await Transaction.create({
    user: previous.user,
    type: "refund",
    amountUzs: amount,
    balanceBeforeUzs: user.balanceUzs - amount,
    balanceAfterUzs: user.balanceUzs,
    order: previous._id,
    note: `Lootbar refund: ${previous.product.title}`,
    sourceKey: `lootbar-refund:${previous.id}`,
  });
}

export async function handleLootbarWebhook(req, res) {
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody) || !(await verifySignature(req, rawBody))) {
    throw new AppError("Invalid webhook signature", 401, "INVALID_WEBHOOK_SIGNATURE");
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new AppError("Invalid webhook JSON", 400, "INVALID_WEBHOOK_PAYLOAD");
  }
  if (!payload.reference_id || !payload.order_id || payload.state === undefined) {
    throw new AppError("Invalid webhook payload", 400, "INVALID_WEBHOOK_PAYLOAD");
  }

  const eventId = crypto.createHash("sha256").update(rawBody).digest("hex");
  try {
    await WebhookEvent.create({ eventId, event: "lootbar.order.status_changed", payload });
  } catch (error) {
    if (error?.code === 11000) return successResponse(res, { duplicate: true });
    throw error;
  }

  const order = await Order.findOne({
    $or: [{ providerReferenceId: payload.reference_id }, { providerOrderId: payload.order_id }],
  });
  if (!order) return successResponse(res, { received: true, matched: false });

  order.providerOrderId = payload.order_id;
  const status = mapLootbarState(payload.state);
  if (status === "completed") {
    order.status = "completed";
    order.completedAt = new Date();
    order.providerPayload = payload;
    await order.save();
  } else if (["failed", "cancelled"].includes(status)) {
    await refundOrder(order, `Lootbar order state ${payload.state}`);
  } else {
    order.status = status;
    order.providerPayload = payload;
    await order.save();
  }

  return successResponse(res, { received: true, matched: true });
}
