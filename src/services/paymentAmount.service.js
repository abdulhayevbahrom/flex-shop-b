import { env } from "../config/env.js";
import { TopUp } from "../models/TopUp.js";
import { AppError } from "../utils/AppError.js";
import { selectNextPaymentCard } from "./paymentCard.service.js";

export async function allocatePaymentAmount({
  userId,
  requestedAmountUzs,
  orderId,
  purpose = "balance",
}) {
  const expiresAt = new Date(Date.now() + 7 * 60 * 1000);
  const card = await selectNextPaymentCard();

  for (let offset = 0; offset <= env.humoPaymentCodeMax; offset += 1) {
    const amountUzs = requestedAmountUzs + offset;
    try {
      return await TopUp.create({
        user: userId,
        requestedAmountUzs,
        amountUzs,
        paymentCode: offset,
        activeAmountKey: String(amountUzs),
        purpose,
        order: orderId,
        paymentCard: card._id,
        cardLabel: card.label,
        cardNumber: card.number,
        cardHolder: card.holder,
        expiresAt,
      });
    } catch (error) {
      if (error?.code === 11000) continue;
      throw error;
    }
  }

  throw new AppError(
    "All payment amounts in the configured range are busy",
    503,
    "PAYMENT_AMOUNTS_BUSY",
  );
}
