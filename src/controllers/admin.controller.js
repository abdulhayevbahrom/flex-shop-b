import { TopUp } from "../models/TopUp.js";
import { PaymentNotification } from "../models/PaymentNotification.js";
import { PaymentCard } from "../models/PaymentCard.js";
import { Order } from "../models/Order.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";
import { fulfillPaidOrder } from "../services/orderFulfillment.service.js";

export async function updateTopUpStatus(req, res) {
  const status = req.body.status;
  if (!["completed", "rejected"].includes(status)) {
    throw new AppError("Status must be completed or rejected", 400, "INVALID_STATUS");
  }

  const topUp = await TopUp.findOneAndUpdate(
    { _id: req.params.topUpId, status: { $in: ["pending", "reviewing"] } },
    {
      $set: {
        status,
        completedAt: status === "completed" ? new Date() : null,
        failureReason: status === "rejected" ? String(req.body.reason ?? "Admin tomonidan rad etildi").trim() : "",
        reviewedBy: req.admin._id,
      },
      $unset: { activeAmountKey: 1 },
    },
    { returnDocument: "before" },
  );
  if (!topUp) {
    throw new AppError("Top-up not found or already finalized", 404, "TOPUP_NOT_PENDING");
  }

  if (status === "completed") {
    if (topUp.paymentCard) {
      await PaymentCard.updateOne(
        { _id: topUp.paymentCard },
        { $inc: { usageCount: 1 } },
      );
    }
    if (topUp.purpose === "order" && topUp.order) {
      await Order.updateOne(
        { _id: topUp.order, status: "awaiting_payment", paidAt: null },
        { $set: { paidAt: new Date(), paymentAmountUzs: topUp.amountUzs } },
      );
      await fulfillPaidOrder(topUp.order);
    } else {
      const user = await User.findByIdAndUpdate(
        topUp.user,
        { $inc: { balanceUzs: topUp.amountUzs } },
        { returnDocument: "after" },
      );
      await Transaction.create({
        user: topUp.user,
        type: "credit",
        amountUzs: topUp.amountUzs,
        balanceBeforeUzs: user.balanceUzs - topUp.amountUzs,
        balanceAfterUzs: user.balanceUzs,
        topUp: topUp._id,
        note: "Manual card top-up",
        sourceKey: `admin-topup:${topUp.id}`,
      });
    }
  }

  return successResponse(res, { topUp: { id: topUp.id, status } });
}

export async function listPaymentNotifications(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const items = await PaymentNotification.find(filter)
    .populate("topUp", "amountUzs requestedAmountUzs status user")
    .sort({ createdAt: -1 })
    .limit(limit);
  return successResponse(res, { items });
}
