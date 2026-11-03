import crypto from "node:crypto";
import { Order } from "../models/Order.js";
import { Transaction } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { Package } from "../models/Package.js";
import { allocatePaymentAmount } from "../services/paymentAmount.service.js";
import {
  createPubgOrder,
  getProviderOrder,
  getPubgCatalog,
  validatePlayer,
  mapLootbarState,
} from "../services/lootbar.service.js";
import {
  createTelegramPremiumOrder,
  getTelegramPremiumPlans,
  getTelegramUser,
} from "../services/fragmentApi.service.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";

function publicOrder(order) {
  return {
    id: order.id,
    providerOrderId: order.providerOrderId,
    providerReferenceId: order.providerReferenceId,
    type: order.type,
    status: order.status,
    product: order.product,
    recipient: order.recipient,
    chargedUzs: order.chargedUzs,
    paymentAmountUzs: order.paymentAmountUzs,
    paymentExpiresAt: order.paymentExpiresAt,
    paidAt: order.paidAt,
    failureReason: order.failureReason,
    createdAt: order.createdAt,
    completedAt: order.completedAt,
  };
}

function failurePayload(error, providerResponse) {
  return {
    ...(providerResponse ? { response: providerResponse } : {}),
    error: {
      message: error?.message || "Provider request failed",
      code: error?.code || "PROVIDER_ERROR",
      statusCode: error?.statusCode || 500,
      ...(error?.details !== undefined ? { details: error.details } : {}),
    },
  };
}

export async function createPaymentOrder(req, res) {
  const key = req.header("Idempotency-Key")?.trim() || crypto.randomUUID();
  const existing = await Order.findOne({ idempotencyKey: key, user: req.user._id }).populate("topUp");
  if (existing) {
    return successResponse(res, {
      order: publicOrder(existing),
      payment: existing.topUp
        ? {
            amountUzs: existing.topUp.amountUzs,
            expiresAt: existing.topUp.expiresAt,
            card: {
              label: existing.topUp.cardLabel,
              number: existing.topUp.cardNumber,
              holder: existing.topUp.cardHolder,
            },
          }
        : null,
    });
  }

  const resolved = await resolveProduct(req.body);
  const order = await Order.create({
    user: req.user._id,
    idempotencyKey: key,
    provider: resolved.provider,
    type: req.body.type,
    status: "awaiting_payment",
    product: resolved.product,
    recipient: resolved.recipient,
    costUsd: resolved.costUsd,
    chargedUzs: resolved.chargedUzs,
  });

  let topUp;
  try {
    topUp = await allocatePaymentAmount({
      userId: req.user._id,
      requestedAmountUzs: resolved.chargedUzs,
      orderId: order._id,
      purpose: "order",
    });
    order.paymentAmountUzs = topUp.amountUzs;
    order.paymentExpiresAt = topUp.expiresAt;
    order.topUp = topUp._id;
    await order.save();
  } catch (error) {
    await Order.deleteOne({ _id: order._id });
    throw error;
  }

  return successResponse(
    res,
    {
      order: publicOrder(order),
      payment: {
        amountUzs: topUp.amountUzs,
        expiresAt: topUp.expiresAt,
        card: {
          label: topUp.cardLabel,
          number: topUp.cardNumber,
          holder: topUp.cardHolder,
        },
      },
    },
    201,
  );
}

async function resolveProduct(body) {
  if (body.type === "pubg_uc") {
    const playerId = String(body.playerId ?? "").trim();
    if (!/^\d{6,}$/.test(playerId)) {
      throw new AppError("Invalid Player ID", 400, "INVALID_PLAYER_ID");
    }
    const packageItem = await Package.findOne({ provider: "lootbar", type: "pubg_uc", providerProductId: body.offerId, visible: true });
    if (!packageItem) throw new AppError("PUBG offer is unavailable", 404, "OFFER_NOT_AVAILABLE");
    const { category, offers } = await getPubgCatalog();
    const offer = offers.offers.find((item) => String(item.offer_id) === String(body.offerId));
    if (!offer) throw new AppError("PUBG offer not found", 404, "OFFER_NOT_FOUND");

    const validation = await validatePlayer(category.category_id, { player_id: playerId });
    if (!validation.valid) {
      throw new AppError("Player ID was not found", 422, "PLAYER_NOT_FOUND");
    }
    return {
      provider: "lootbar",
      costUsd: offer.price_usd,
      chargedUzs: packageItem.retailPriceUzs,
      product: {
        categoryId: category.category_id,
        offerId: offer.offer_id,
        title: offer.name,
      },
      recipient: { playerId, playerName: validation.player_name ?? "" },
      send: (key) =>
        createPubgOrder({
          categoryId: category.category_id,
          offerId: offer.offer_id,
          fields: { player_id: playerId },
          key,
        }),
    };
  }

  if (body.type === "telegram_premium") {
    const username = String(body.telegramUsername ?? "").trim();
    const months = Number(body.months);
    if (!/^@[A-Za-z0-9_]{5,}$/.test(username)) {
      throw new AppError("Invalid Telegram username", 400, "INVALID_USERNAME");
    }
    const packageItem = await Package.findOne({ provider: "fragment", type: "telegram_premium", providerProductId: `premium_${months}`, visible: true });
    if (!packageItem) throw new AppError("Premium plan is unavailable", 404, "PLAN_NOT_AVAILABLE");
    const premium = await getTelegramPremiumPlans();
    const plan = premium.plans.find((item) => item.months === months);
    if (!plan) throw new AppError("Premium plan not found", 404, "PLAN_NOT_FOUND");
    const telegramUser = await getTelegramUser(username);
    return {
      provider: "fragment",
      costUsd: plan.price_usd,
      chargedUzs: packageItem.retailPriceUzs,
      product: { title: `Telegram Premium ${months} months`, months },
      recipient: { telegramUsername: username, playerName: telegramUser?.name ?? "" },
      send: (key) => createTelegramPremiumOrder({ username, months, key }),
    };
  }

  throw new AppError("Unsupported order type", 400, "INVALID_ORDER_TYPE");
}

export async function createOrder(req, res) {
  const key = req.header("Idempotency-Key")?.trim() || crypto.randomUUID();
  const existing = await Order.findOne({ idempotencyKey: key, user: req.user._id });
  if (existing) return successResponse(res, { order: publicOrder(existing) });

  const resolved = await resolveProduct(req.body);
  const before = await User.findOneAndUpdate(
    { _id: req.user._id, balanceUzs: { $gte: resolved.chargedUzs } },
    { $inc: { balanceUzs: -resolved.chargedUzs } },
    { returnDocument: "before" },
  );
  if (!before) {
    throw new AppError("Insufficient balance", 402, "INSUFFICIENT_BALANCE", {
      requiredUzs: resolved.chargedUzs,
      balanceUzs: req.user.balanceUzs,
    });
  }

  let order;
  try {
    order = await Order.create({
      user: req.user._id,
      idempotencyKey: key,
      provider: resolved.provider,
      type: req.body.type,
      product: resolved.product,
      recipient: resolved.recipient,
      costUsd: resolved.costUsd,
      chargedUzs: resolved.chargedUzs,
    });
    await Transaction.create({
      user: req.user._id,
      type: "debit",
      amountUzs: -resolved.chargedUzs,
      balanceBeforeUzs: before.balanceUzs,
      balanceAfterUzs: before.balanceUzs - resolved.chargedUzs,
      order: order._id,
      note: resolved.product.title,
    });

    const provider = await resolved.send(key);
    const providerOrder = provider.order ?? provider;
    order.providerOrderId = providerOrder.id ?? providerOrder.order_id;
    order.providerReferenceId = providerOrder.reference_id;
    order.status = providerOrder.state ? mapLootbarState(providerOrder.state) : (providerOrder.status ?? "processing");
    order.providerPayload = provider;
    if (["failed", "cancelled"].includes(order.status)) {
      throw new AppError(
        providerOrder.message || providerOrder.msg || `Provider order ${order.status}`,
        502,
        "PROVIDER_ORDER_FAILED",
        { providerStatus: order.status, providerOrder },
      );
    }
    if (order.status === "completed") order.completedAt = new Date();
    await order.save();
  } catch (error) {
    if (order && error.details?.outcomeUnknown) {
      order.status = "manual_review";
      order.failureReason = error.message;
      order.providerPayload = failurePayload(error, order.providerPayload);
      await order.save();
      return successResponse(res, { order: publicOrder(order) }, 202);
    }
    const refundedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $inc: { balanceUzs: resolved.chargedUzs } },
      { returnDocument: "after" },
    );
    if (order) {
      order.status = "failed";
      order.failureReason = error.message;
      order.providerPayload = failurePayload(error, order.providerPayload);
      order.refundedAt = new Date();
      await order.save();
      await Transaction.create({
        user: req.user._id,
        type: "refund",
        amountUzs: resolved.chargedUzs,
        balanceBeforeUzs: refundedUser.balanceUzs - resolved.chargedUzs,
        balanceAfterUzs: refundedUser.balanceUzs,
        order: order._id,
        note: `Refund: ${resolved.product.title}`,
      });
    }
    throw error;
  }

  return successResponse(res, { order: publicOrder(order) }, 201);
}

export async function listOrders(req, res) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const filter = { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  return successResponse(res, { items: items.map(publicOrder), total, page, limit });
}

export async function getOrder(req, res) {
  const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id });
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

  if (order.providerOrderId && ["created", "processing"].includes(order.status)) {
    const provider = await getProviderOrder(order.providerReferenceId ?? order.idempotencyKey);
    const nextStatus = provider.data?.state ? mapLootbarState(provider.data.state) : provider.order?.status;
    if (nextStatus && nextStatus !== order.status) {
      order.status = nextStatus;
      order.providerPayload = provider;
      if (nextStatus === "completed") order.completedAt = new Date();
      await order.save();
    }
  }
  return successResponse(res, { order: publicOrder(order) });
}
