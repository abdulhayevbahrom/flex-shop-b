import { PaymentCard } from "../models/PaymentCard.js";
import { TopUp } from "../models/TopUp.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";

function normalizeNumber(value) {
  const number = String(value ?? "").replace(/\D/g, "");
  if (number.length < 16 || number.length > 19) {
    throw new AppError("Karta raqami 16–19 ta raqamdan iborat bo‘lishi kerak", 400, "INVALID_CARD_NUMBER");
  }
  return number;
}

function output(card, usageCount = card.usageCount) {
  return {
    id: card.id, label: card.label, number: card.number, holder: card.holder,
    active: card.active, sortOrder: card.sortOrder, usageCount,
    createdAt: card.createdAt, updatedAt: card.updatedAt,
  };
}

export async function listPaymentCards(_req, res) {
  const cards = await PaymentCard.find().sort({ sortOrder: 1, createdAt: 1 });
  const counts = await TopUp.aggregate([
    { $match: { status: "completed", paymentCard: { $ne: null } } },
    { $group: { _id: "$paymentCard", count: { $sum: 1 } } },
  ]);
  const countByCard = new Map(counts.map((item) => [String(item._id), item.count]));
  return successResponse(res, {
    items: cards.map((card) => output(card, countByCard.get(String(card._id)) ?? 0)),
  });
}

export async function createPaymentCard(req, res) {
  const label = String(req.body.label ?? "").trim();
  const holder = String(req.body.holder ?? "").trim();
  if (!label || !holder) throw new AppError("Karta nomi va egasi majburiy", 400, "INVALID_CARD");
  const card = await PaymentCard.create({
    label, holder, number: normalizeNumber(req.body.number),
    active: req.body.active !== false, sortOrder: Number(req.body.sortOrder) || 0,
  });
  return successResponse(res, { item: output(card) }, 201);
}

export async function updatePaymentCard(req, res) {
  const changes = {};
  if (req.body.label !== undefined) {
    changes.label = String(req.body.label).trim();
    if (!changes.label) throw new AppError("Karta nomi bo‘sh bo‘lmasligi kerak", 400, "INVALID_CARD");
  }
  if (req.body.holder !== undefined) {
    changes.holder = String(req.body.holder).trim();
    if (!changes.holder) throw new AppError("Karta egasi bo‘sh bo‘lmasligi kerak", 400, "INVALID_CARD");
  }
  if (req.body.number !== undefined) changes.number = normalizeNumber(req.body.number);
  if (req.body.active !== undefined) changes.active = Boolean(req.body.active);
  if (req.body.sortOrder !== undefined) {
    const order = Number(req.body.sortOrder);
    if (!Number.isSafeInteger(order)) throw new AppError("Tartib raqami noto‘g‘ri", 400, "INVALID_SORT_ORDER");
    changes.sortOrder = order;
  }
  const card = await PaymentCard.findByIdAndUpdate(req.params.cardId, { $set: changes }, { returnDocument: "after", runValidators: true });
  if (!card) throw new AppError("Karta topilmadi", 404, "PAYMENT_CARD_NOT_FOUND");
  const usageCount = await TopUp.countDocuments({ paymentCard: card._id, status: "completed" });
  return successResponse(res, { item: output(card, usageCount) });
}

export async function deletePaymentCard(req, res) {
  const card = await PaymentCard.findByIdAndDelete(req.params.cardId);
  if (!card) throw new AppError("Karta topilmadi", 404, "PAYMENT_CARD_NOT_FOUND");
  return successResponse(res);
}
