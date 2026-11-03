import { Order } from "../models/Order.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { getProviderOrder, mapLootbarState } from "./lootbar.service.js";

async function refundTerminalOrder(order, status, provider) {
  const reason = provider?.data?.message || provider?.data?.msg || `Lootbar order ${status}`;
  const previous = await Order.findOneAndUpdate(
    { _id: order._id, status: { $in: ["created", "processing", "partial"] } },
    { $set: { status: "refunded", refundedAt: new Date(), failureReason: reason, providerPayload: provider } },
    { returnDocument: "before" },
  );
  if (!previous) return order;
  const amount = previous.paymentAmountUzs ?? previous.chargedUzs;
  const user = await User.findByIdAndUpdate(previous.user, { $inc: { balanceUzs: amount } }, { returnDocument: "after" });
  await Transaction.create({
    user: previous.user,
    type: "refund",
    amountUzs: amount,
    balanceBeforeUzs: user.balanceUzs - amount,
    balanceAfterUzs: user.balanceUzs,
    order: previous._id,
    note: `Lootbar status sync refund: ${previous.product.title}`,
    sourceKey: `lootbar-sync-refund:${previous.id}`,
  });
  order.status = "refunded";
  order.refundedAt = new Date();
  order.failureReason = reason;
  order.providerPayload = provider;
  return order;
}

export async function syncLootbarOrderStatus(order) {
  if (order.provider !== "lootbar" || !["created", "processing", "partial"].includes(order.status)) return order;
  const referenceId = order.providerReferenceId || order.idempotencyKey;
  if (!referenceId) return order;
  const provider = await getProviderOrder(referenceId);
  const state = provider.data?.state ?? provider.order?.state;
  if (state === undefined || state === null) return order;
  const nextStatus = mapLootbarState(state);
  if (["failed", "cancelled"].includes(nextStatus)) return refundTerminalOrder(order, nextStatus, provider);
  order.status = nextStatus;
  order.providerPayload = provider;
  if (nextStatus === "completed" && !order.completedAt) order.completedAt = new Date();
  await order.save();
  return order;
}

let timer = null;
let running = false;

async function sweep() {
  if (running) return;
  running = true;
  try {
    const orders = await Order.find({
      provider: "lootbar",
      status: { $in: ["created", "processing", "partial"] },
    }).sort({ createdAt: 1 }).limit(100);
    await Promise.allSettled(orders.map((order) => syncLootbarOrderStatus(order)));
  } finally {
    running = false;
  }
}

export function startOrderStatusSyncWorker() {
  if (timer) return;
  sweep().catch((error) => console.error("Order status sync failed", error));
  timer = setInterval(() => sweep().catch((error) => console.error("Order status sync failed", error)), 30_000);
  timer.unref?.();
}

export function stopOrderStatusSyncWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
