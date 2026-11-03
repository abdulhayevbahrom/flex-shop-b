import { env } from "../config/env.js";
import { PaymentCard } from "../models/PaymentCard.js";
import { SystemSetting } from "../models/SystemSetting.js";
import { AppError } from "../utils/AppError.js";

export async function selectNextPaymentCard() {
  const cards = await PaymentCard.find({ active: true }).sort({ sortOrder: 1, createdAt: 1 });
  if (!cards.length) throw new AppError("Faol to‘lov kartasi mavjud emas", 503, "PAYMENT_CARD_NOT_CONFIGURED");
  let sequence;
  try {
    sequence = await SystemSetting.findOneAndUpdate(
      { key: "paymentCardSequence" }, { $inc: { value: 1 } },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    sequence = await SystemSetting.findOneAndUpdate(
      { key: "paymentCardSequence" }, { $inc: { value: 1 } }, { returnDocument: "after" },
    );
  }
  const index = (Number(sequence.value) - 1) % cards.length;
  return cards[index];
}

export async function ensureInitialPaymentCard() {
  if (await PaymentCard.exists({})) return;
  const number = env.topUpCardNumber.replace(/\D/g, "");
  if (!number) return;
  await PaymentCard.create({
    label: env.topUpCardLabel,
    number,
    holder: env.topUpCardHolder || "CARD HOLDER",
    active: true,
  });
}
