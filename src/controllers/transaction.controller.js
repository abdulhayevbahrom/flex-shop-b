import { Transaction } from "../models/Transaction.js";
import { successResponse } from "../utils/responses.js";

export async function listTransactions(req, res) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const filter = { user: req.user._id };
  const [items, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Transaction.countDocuments(filter),
  ]);
  return successResponse(res, { items, total, page, limit });
}
