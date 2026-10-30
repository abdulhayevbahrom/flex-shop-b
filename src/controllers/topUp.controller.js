import { env } from "../config/env.js";
import { TopUp } from "../models/TopUp.js";
import { allocatePaymentAmount } from "../services/paymentAmount.service.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";

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
      topUp: {
        id: topUp.id,
        amountUzs: topUp.amountUzs,
        requestedAmountUzs: topUp.requestedAmountUzs,
        paymentCode: topUp.paymentCode,
        status: topUp.status,
        card: {
          label: topUp.cardLabel,
          number: topUp.cardNumber,
          holder: topUp.cardHolder,
        },
        expiresAt: topUp.expiresAt,
      },
    },
    201,
  );
}

export async function listTopUps(req, res) {
  const items = await TopUp.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100);
  return successResponse(res, { items });
}
