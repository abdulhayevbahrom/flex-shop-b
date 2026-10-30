import mongoose from "mongoose";
import { Order } from "../models/Order.js";
import { getBotEnabled, setBotEnabled } from "../services/systemSettings.service.js";
import { broadcastBotStarted } from "../services/telegramBot.service.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";

function monthRange(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value ?? ""));
  const now = new Date();
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) : now.getUTCMonth() + 1;
  const offset = 5 * 60 * 60 * 1000;
  return {
    month: `${year}-${String(month).padStart(2, "0")}`,
    start: new Date(Date.UTC(year, month - 1, 1) - offset),
    end: new Date(Date.UTC(year, month, 1) - offset),
  };
}

function orderSummary(order) {
  return {
    id: order.id, providerOrderId: order.providerOrderId,
    providerReferenceId: order.providerReferenceId, type: order.type,
    status: order.status, product: order.product, recipient: order.recipient,
    costUsd: Number(order.costUsd.toString()), chargedUzs: order.chargedUzs,
    paymentAmountUzs: order.paymentAmountUzs, paidAt: order.paidAt,
    createdAt: order.createdAt, completedAt: order.completedAt,
    failureReason: order.failureReason,
    user: order.user ? {
      id: order.user.id, telegramId: order.user.telegramId,
      username: order.user.username, firstName: order.user.firstName,
      lastName: order.user.lastName,
    } : null,
  };
}

export async function getBotStatus(_req, res) {
  return successResponse(res, { enabled: await getBotEnabled() });
}

export async function updateBotStatus(req, res) {
  if (typeof req.body.enabled !== "boolean") throw new AppError("enabled boolean bo‘lishi kerak", 400, "INVALID_BOT_STATUS");
  const wasEnabled = await getBotEnabled();
  const enabled = await setBotEnabled(req.body.enabled, req.admin._id);
  const broadcastStarted = !wasEnabled && enabled ? broadcastBotStarted() : false;
  return successResponse(res, { enabled, broadcastStarted });
}

export async function listAdminOrders(req, res) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  const search = String(req.query.search ?? "").trim();
  if (search) {
    const clauses = [
      { providerOrderId: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
      { "recipient.playerId": search },
      { "recipient.telegramUsername": { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
    ];
    if (mongoose.isValidObjectId(search)) clauses.push({ _id: new mongoose.Types.ObjectId(search) });
    filter.$or = clauses;
  }
  const [orders, total] = await Promise.all([
    Order.find(filter).populate("user", "telegramId username firstName lastName").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  return successResponse(res, { items: orders.map(orderSummary), total, page, pages: Math.ceil(total / limit) });
}

export async function getAdminOrder(req, res) {
  const order = await Order.findById(req.params.orderId)
    .populate("user", "telegramId username firstName lastName balanceUzs isBlocked")
    .populate("topUp");
  if (!order) throw new AppError("Zakaz topilmadi", 404, "ORDER_NOT_FOUND");
  return successResponse(res, { order: { ...orderSummary(order), topUp: order.topUp, providerPayload: order.providerPayload, refundedAt: order.refundedAt, paymentExpiresAt: order.paymentExpiresAt } });
}

export async function getAdminStatistics(req, res) {
  const range = monthRange(req.query.month);
  const match = { status: "completed", completedAt: { $gte: range.start, $lt: range.end } };
  const [totalsResult, games, products, trend] = await Promise.all([
    Order.aggregate([{ $match: match }, { $group: { _id: null, orders: { $sum: 1 }, revenueUzs: { $sum: "$chargedUzs" }, providerCostUsd: { $sum: { $toDouble: "$costUsd" } } } }]),
    Order.aggregate([{ $match: match }, { $group: { _id: "$type", orders: { $sum: 1 }, revenueUzs: { $sum: "$chargedUzs" }, providerCostUsd: { $sum: { $toDouble: "$costUsd" } } } }, { $sort: { orders: -1 } }]),
    Order.aggregate([{ $match: match }, { $group: { _id: { type: "$type", title: "$product.title" }, orders: { $sum: 1 }, revenueUzs: { $sum: "$chargedUzs" }, providerCostUsd: { $sum: { $toDouble: "$costUsd" } } } }, { $sort: { orders: -1 } }]),
    Order.aggregate([{ $match: { status: "completed", completedAt: { $gte: new Date(Date.now() - 370 * 86400000) } } }, { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$completedAt", timezone: "+05:00" } }, orders: { $sum: 1 }, revenueUzs: { $sum: "$chargedUzs" }, providerCostUsd: { $sum: { $toDouble: "$costUsd" } } } }, { $sort: { _id: 1 } }]),
  ]);
  const totals = totalsResult[0] ?? { orders: 0, revenueUzs: 0, providerCostUsd: 0 };
  return successResponse(res, {
    month: range.month,
    totals,
    games: games.map((item) => ({ type: item._id, title: item._id === "pubg_uc" ? "PUBG Mobile" : "Telegram Premium", orders: item.orders, revenueUzs: item.revenueUzs, providerCostUsd: item.providerCostUsd })),
    products: products.map((item) => ({ type: item._id.type, title: item._id.title, orders: item.orders, revenueUzs: item.revenueUzs, providerCostUsd: item.providerCostUsd })),
    trend: trend.map((item) => ({ month: item._id, orders: item.orders, revenueUzs: item.revenueUzs, providerCostUsd: item.providerCostUsd })),
  });
}
