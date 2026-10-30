import { Order } from "../models/Order.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import {
  createPubgOrder,
  mapLootbarState,
} from "./lootbar.service.js";
import { createTelegramPremiumOrder } from "./fragmentApi.service.js";

async function sendToProvider(order) {
  if (order.type === "pubg_uc") {
    return createPubgOrder({
      categoryId: order.product.categoryId,
      offerId: order.product.offerId,
      fields: { player_id: order.recipient.playerId },
      key: order.idempotencyKey,
    });
  }
  if (order.type === "telegram_premium") {
    return createTelegramPremiumOrder({
      username: order.recipient.telegramUsername,
      months: order.product.months,
      key: order.idempotencyKey,
    });
  }
  throw new Error(`Unsupported paid order type: ${order.type}`);
}

export async function fulfillPaidOrder(orderId) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: "awaiting_payment", paidAt: { $ne: null } },
    { $set: { status: "processing" } },
    { new: true },
  );
  if (!order) return null;

  try {
    const provider = await sendToProvider(order);
    const providerOrder = provider.order ?? provider;
    order.providerOrderId = providerOrder.id ?? providerOrder.order_id;
    order.providerReferenceId = providerOrder.reference_id;
    order.status = providerOrder.state ? mapLootbarState(providerOrder.state) : (providerOrder.status ?? "processing");
    order.providerPayload = provider;
    if (order.status === "completed") order.completedAt = new Date();
    await order.save();
    return order;
  } catch (error) {
    if (error.details?.outcomeUnknown) {
      order.status = "manual_review";
      order.failureReason = error.message;
      await order.save();
      return order;
    }
    const refundAmount = order.paymentAmountUzs ?? order.chargedUzs;
    const user = await User.findByIdAndUpdate(
      order.user,
      { $inc: { balanceUzs: refundAmount } },
      { new: true },
    );
    order.status = "refunded";
    order.failureReason = error.message;
    order.refundedAt = new Date();
    await order.save();
    await Transaction.create({
      user: order.user,
      type: "refund",
      amountUzs: refundAmount,
      balanceBeforeUzs: user.balanceUzs - refundAmount,
      balanceAfterUzs: user.balanceUzs,
      order: order._id,
      note: `Paid order refund: ${order.product.title}`,
      sourceKey: `paid-order-refund:${order.id}`,
    });
    return order;
  }
}
