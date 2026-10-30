import { Order } from "../models/Order.js";
import { TopUp } from "../models/TopUp.js";
import { fulfillPaidOrder } from "./orderFulfillment.service.js";

let timer;

async function sweep() {
  const now = new Date();
  const expired = await TopUp.find({
    status: "pending",
    expiresAt: { $lte: now },
  }).select("_id order");

  if (expired.length) {
    const ids = expired.map((item) => item._id);
    await TopUp.updateMany(
      { _id: { $in: ids }, status: "pending" },
      { $set: { status: "expired" }, $unset: { activeAmountKey: 1 } },
    );
    const orderIds = expired.map((item) => item.order).filter(Boolean);
    if (orderIds.length) {
      await Order.updateMany(
        { _id: { $in: orderIds }, status: "awaiting_payment", paidAt: null },
        { $set: { status: "cancelled" } },
      );
    }
  }

  const paidWaiting = await Order.find({
    status: "awaiting_payment",
    paidAt: { $ne: null },
  }).select("_id");
  for (const order of paidWaiting) {
    await fulfillPaidOrder(order._id);
  }
}

export function startPaymentExpiryWorker() {
  timer = setInterval(() => sweep().catch((error) => console.error("Payment sweep failed", error)), 15_000);
  timer.unref();
  sweep().catch((error) => console.error("Initial payment sweep failed", error));
}

export function stopPaymentExpiryWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
