import { env } from "../config/env.js";
import { TopUp } from "../models/TopUp.js";
import { allocatePaymentAmount } from "../services/paymentAmount.service.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";

function output(topUp) {
  return {
    id: topUp.id,
    amountUzs: topUp.amountUzs,
    requestedAmountUzs: topUp.requestedAmountUzs,
    paymentCode: topUp.paymentCode,
    purpose: topUp.purpose,
    status: topUp.status,
    card: {
      label: topUp.cardLabel,
      number: topUp.cardNumber,
      holder: topUp.cardHolder,
    },
    expiresAt: topUp.expiresAt,
    completedAt: topUp.completedAt ?? null,
    createdAt: topUp.createdAt,
  };
}

export async function createTopUp(req, res) {
  const requestedAmountUzs = Number(req.body.amount ?? req.body.amountUzs);
  if (!Number.isInteger(requestedAmountUzs) || requestedAmountUzs < env.topUpMinAmountUzs) {
    throw new AppError(
      `Minimum top-up amount is ${env.topUpMinAmountUzs} UZS`,
      400,
      "INVALID_TOPUP_AMOUNT",
    );
  }
  const topUp = await allocatePaymentAmount({
    userId: req.user._id,
    requestedAmountUzs,
    purpose: "balance",
  });

  return successResponse(
    res,
    {
      topUp: output(topUp),
    },
    201,
  );
}

export async function listTopUps(req, res) {
  const items = await TopUp.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
  return successResponse(res, { items: items.map(output) });
}

export async function getTopUp(req, res) {
  let topUp = await TopUp.findOne({ _id: req.params.topUpId, user: req.user._id });
  if (!topUp) throw new AppError("Top-up topilmadi", 404, "TOPUP_NOT_FOUND");
  if (topUp.status === "pending" && topUp.expiresAt <= new Date()) {
    topUp = await TopUp.findOneAndUpdate(
      { _id: topUp._id, status: "pending" },
      { $set: { status: "expired" }, $unset: { activeAmountKey: 1 } },
      { returnDocument: "after" },
    ) ?? topUp;
  }
  return successResponse(res, { topUp: output(topUp) });
}
