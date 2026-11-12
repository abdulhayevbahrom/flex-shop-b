import mongoose from "mongoose";
import { PaymentNotification } from "../models/PaymentNotification.js";
import { PaymentCard } from "../models/PaymentCard.js";
import { Order } from "../models/Order.js";
import { TopUp } from "../models/TopUp.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { parseHumoMessage } from "../utils/humoMessageParser.js";
import { fulfillPaidOrder } from "./orderFulfillment.service.js";

export async function processHumoNotification({
  telegramMessageId,
  telegramChatId,
  senderUsername,
  text,
  telegramDate,
}) {
  const parsed = parseHumoMessage(text);
  // Persist the raw event first. Matching can fail or be retried independently;
  // the unique Telegram message key makes replay safe.
  let notification;
  try {
    notification = await PaymentNotification.findOneAndUpdate(
      { telegramMessageId },
      {
        $setOnInsert: {
          telegramMessageId,
          telegramChatId,
          senderUsername,
          direction: parsed.direction,
          amountUzs: parsed.amountUzs,
          text: parsed.text,
          telegramDate,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    notification = await PaymentNotification.findOne({ telegramMessageId });
    if (!notification) throw error;
  }
  if (notification.status === "matched" || notification.status === "ignored") {
    return { duplicate: true, status: notification.status };
  }

  if (parsed.direction !== "credit" || !parsed.amountUzs) {
    notification.status = "ignored";
    notification.reason = parsed.direction === "debit" ? "Debit notification" : "Unrecognized message";
    await notification.save();
    return { ignored: true, notification };
  }

  const session = await mongoose.startSession();
  let matchedTopUp = null;
  try {
    await session.withTransaction(async () => {
      matchedTopUp = null;
      // Claim the event in the same transaction as the balance change.
      const claim = await PaymentNotification.updateOne(
        { _id: notification._id, status: { $in: ["received", "unmatched", "error"] } },
        { $set: { status: "received", reason: "" } },
        { session },
      );
      if (!claim.matchedCount) return;

      const paymentAt = telegramDate ?? new Date();
      const candidates = await TopUp.find({
        amountUzs: parsed.amountUzs,
        status: { $in: ["pending", "expired"] },
        createdAt: { $lte: paymentAt },
        // Accept late-delivered notifications when the bank timestamp proves
        // the transfer happened during the payment window.
        expiresAt: { $gt: paymentAt },
      }).sort({ createdAt: -1 }).limit(2).session(session);

      if (candidates.length > 1) {
        await PaymentNotification.updateOne(
          { _id: notification._id },
          { $set: { status: "unmatched", reason: "Multiple eligible top-ups have this exact amount" } },
          { session },
        );
        return;
      }

      matchedTopUp = candidates[0] ? await TopUp.findOneAndUpdate(
        {
          _id: candidates[0]._id,
          status: { $in: ["pending", "expired"] },
          createdAt: { $lte: paymentAt },
          expiresAt: { $gt: paymentAt },
        },
        {
          $set: {
            status: "completed",
            completedAt: telegramDate ?? new Date(),
            matchedNotification: notification._id,
          },
          $unset: { activeAmountKey: 1 },
        },
        { returnDocument: "before", session },
      ) : null;

      if (!matchedTopUp) {
        await PaymentNotification.updateOne(
          { _id: notification._id },
          { $set: { status: "unmatched", reason: "No pending top-up with this exact amount" } },
          { session },
        );
        return;
      }

      if (matchedTopUp.paymentCard) {
        await PaymentCard.updateOne(
          { _id: matchedTopUp.paymentCard },
          { $inc: { usageCount: 1 } },
          { session },
        );
      }

      if (matchedTopUp.purpose === "order" && matchedTopUp.order) {
        const paidOrder = await Order.findOneAndUpdate(
          {
            _id: matchedTopUp.order,
            $or: [
              { status: "awaiting_payment", paidAt: null },
              // The expiry worker can mark the order cancelled just before this
              // notification is processed. The bank timestamp above proves
              // payment was made before expiry, so restore it atomically.
              { status: "cancelled", paidAt: null, paymentExpiresAt: { $gt: telegramDate ?? new Date() } },
            ],
          },
          {
            $set: {
              status: "awaiting_payment",
              paidAt: telegramDate ?? new Date(),
              paymentAmountUzs: matchedTopUp.amountUzs,
            },
          },
          { returnDocument: "after", session },
        );
        if (!paidOrder) throw new Error("Linked order is no longer awaiting payment");
      } else {
        const user = await User.findByIdAndUpdate(
          matchedTopUp.user,
          { $inc: { balanceUzs: matchedTopUp.amountUzs } },
          { returnDocument: "after", session },
        );
        await Transaction.create(
          [
            {
              user: matchedTopUp.user,
              type: "credit",
              amountUzs: matchedTopUp.amountUzs,
              balanceBeforeUzs: user.balanceUzs - matchedTopUp.amountUzs,
              balanceAfterUzs: user.balanceUzs,
              topUp: matchedTopUp._id,
              note: "HUMO Telegram notification",
              sourceKey: `humo:${telegramMessageId}`,
            },
          ],
          { session },
        );
      }
      await PaymentNotification.updateOne(
        { _id: notification._id },
        { $set: { status: "matched", topUp: matchedTopUp._id } },
        { session },
      );
    });
  } catch (error) {
    await PaymentNotification.updateOne(
      { _id: notification._id, status: { $in: ["received", "unmatched", "error"] } },
      { $set: { status: "error", reason: error.message } },
    );
    throw error;
  } finally {
    await session.endSession();
  }

  if (matchedTopUp?.purpose === "order" && matchedTopUp.order) {
    await fulfillPaidOrder(matchedTopUp.order);
  }

  return matchedTopUp
    ? { matched: true, topUpId: matchedTopUp.id }
    : { unmatched: true, notificationId: notification.id };
}

export async function retryUnmatchedHumoNotifications({ limit = 100 } = {}) {
  const notifications = await PaymentNotification.find({
    direction: "credit",
    status: { $in: ["unmatched", "error"] },
    amountUzs: { $gt: 0 },
  }).sort({ telegramDate: 1 }).limit(limit);
  const results = [];
  for (const item of notifications) {
    try {
      results.push(await processHumoNotification({
        telegramMessageId: item.telegramMessageId,
        telegramChatId: item.telegramChatId,
        senderUsername: item.senderUsername,
        text: item.text,
        telegramDate: item.telegramDate,
      }));
    } catch (error) {
      console.error("Unmatched payment notification retry failed", {
        notificationId: item.id,
        error: error.message,
      });
    }
  }
  return results;
}
