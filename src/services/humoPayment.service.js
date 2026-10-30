import mongoose from "mongoose";
import { PaymentNotification } from "../models/PaymentNotification.js";
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
  let notification;
  try {
    notification = await PaymentNotification.create({
      telegramMessageId,
      telegramChatId,
      senderUsername,
      direction: parsed.direction,
      amountUzs: parsed.amountUzs,
      text: parsed.text,
      telegramDate,
    });
  } catch (error) {
    if (error?.code === 11000) return { duplicate: true };
    throw error;
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
      matchedTopUp = await TopUp.findOneAndUpdate(
        {
          amountUzs: parsed.amountUzs,
          status: "pending",
          createdAt: { $lte: telegramDate ?? new Date() },
          expiresAt: { $gt: telegramDate ?? new Date() },
        },
        {
          $set: {
            status: "completed",
            completedAt: telegramDate ?? new Date(),
            matchedNotification: notification._id,
          },
          $unset: { activeAmountKey: 1 },
        },
        { new: false, session },
      );

      if (!matchedTopUp) {
        await PaymentNotification.updateOne(
          { _id: notification._id },
          { $set: { status: "unmatched", reason: "No pending top-up with this exact amount" } },
          { session },
        );
        return;
      }

      if (matchedTopUp.purpose === "order" && matchedTopUp.order) {
        const paidOrder = await Order.findOneAndUpdate(
          {
            _id: matchedTopUp.order,
            status: "awaiting_payment",
            paidAt: null,
          },
          {
            $set: {
              paidAt: telegramDate ?? new Date(),
              paymentAmountUzs: matchedTopUp.amountUzs,
            },
          },
          { new: true, session },
        );
        if (!paidOrder) throw new Error("Linked order is no longer awaiting payment");
      } else {
        const user = await User.findByIdAndUpdate(
          matchedTopUp.user,
          { $inc: { balanceUzs: matchedTopUp.amountUzs } },
          { new: true, session },
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
      { _id: notification._id },
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
    : { unmatched: true };
}
