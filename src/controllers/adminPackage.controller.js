import { Package } from "../models/Package.js";
import { getProviderBalance, getPubgCatalog } from "../services/lootbar.service.js";
import { getFragmentBalance, getTelegramPremiumPlans } from "../services/fragmentApi.service.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";

const keyOf = (item) => `${item.provider}:${item.type}:${item.providerProductId}`;

function publicPackage(item) {
  return {
    id: item.id, provider: item.provider, type: item.type, providerProductId: item.providerProductId,
    providerCategoryId: item.providerCategoryId, name: item.name,
    providerPriceUsd: Number(item.providerPriceUsd.toString()),
    retailPriceUzs: item.retailPriceUzs, visible: item.visible,
    sortOrder: item.sortOrder, metadata: item.metadata,
    providerUpdatedAt: item.providerUpdatedAt, updatedAt: item.updatedAt,
  };
}

async function providerCatalog() {
  const [pubgResult, premiumResult] = await Promise.allSettled([
    getPubgCatalog(), getTelegramPremiumPlans(),
  ]);
  const pubg = pubgResult.status === "fulfilled" ? pubgResult.value : null;
  const premium = premiumResult.status === "fulfilled" ? premiumResult.value : { plans: [] };
  return [
    ...(pubg?.offers.offers ?? []).map((offer) => ({
      provider: "lootbar",
      type: "pubg_uc", providerProductId: String(offer.offer_id),
      providerCategoryId: pubg.category.category_id, name: offer.name,
      providerPriceUsd: Number(offer.price_usd), metadata: {},
    })),
    ...premium.plans.map((plan) => ({
      provider: "fragment",
      type: "telegram_premium", providerProductId: `premium_${plan.months}`,
      providerCategoryId: "", name: `Telegram Premium ${plan.months} oy`,
      providerPriceUsd: Number(plan.price_usd), metadata: { months: plan.months },
    })),
  ];
}

export async function listPackages(_req, res) {
  const items = await Package.find().sort({ type: 1, sortOrder: 1, createdAt: 1 });
  return successResponse(res, { items: items.map(publicPackage) });
}

export async function listProviderPackages(_req, res) {
  const catalog = await providerCatalog();
  const local = await Package.find({}, "provider type providerProductId providerPriceUsd");
  const localByKey = new Map(local.map((item) => [keyOf(item), item]));
  await Promise.all(catalog.map((item) => {
    const found = localByKey.get(keyOf(item));
    if (!found || Number(found.providerPriceUsd.toString()) === item.providerPriceUsd) return null;
    return Package.updateOne({ _id: found._id }, { $set: { providerPriceUsd: item.providerPriceUsd, providerUpdatedAt: new Date() } });
  }));
  return successResponse(res, { items: catalog.map((item) => ({ ...item, configured: localByKey.has(keyOf(item)) })) });
}

export async function createPackage(req, res) {
  const type = String(req.body.type ?? "");
  const providerProductId = String(req.body.providerProductId ?? "");
  const retailPriceUzs = Number(req.body.retailPriceUzs);
  if (!Number.isSafeInteger(retailPriceUzs) || retailPriceUzs < 0) {
    throw new AppError("Sotuv narxi noto‘g‘ri", 400, "INVALID_RETAIL_PRICE");
  }
  const source = (await providerCatalog()).find((item) => item.type === type && item.providerProductId === providerProductId);
  if (!source) throw new AppError("API paketi topilmadi", 404, "PROVIDER_PACKAGE_NOT_FOUND");
  const item = await Package.create({ ...source, retailPriceUzs, visible: req.body.visible !== false, sortOrder: Number(req.body.sortOrder) || 0, providerUpdatedAt: new Date() });
  return successResponse(res, { item: publicPackage(item) }, 201);
}

export async function updatePackage(req, res) {
  const changes = {};
  if (req.body.retailPriceUzs !== undefined) {
    const value = Number(req.body.retailPriceUzs);
    if (!Number.isSafeInteger(value) || value < 0) throw new AppError("Sotuv narxi noto‘g‘ri", 400, "INVALID_RETAIL_PRICE");
    changes.retailPriceUzs = value;
  }
  if (req.body.visible !== undefined) changes.visible = Boolean(req.body.visible);
  if (req.body.sortOrder !== undefined) {
    const value = Number(req.body.sortOrder);
    if (!Number.isSafeInteger(value)) throw new AppError("Tartib raqami noto‘g‘ri", 400, "INVALID_SORT_ORDER");
    changes.sortOrder = value;
  }
  const item = await Package.findByIdAndUpdate(req.params.packageId, { $set: changes }, { returnDocument: "after", runValidators: true });
  if (!item) throw new AppError("Paket topilmadi", 404, "PACKAGE_NOT_FOUND");
  return successResponse(res, { item: publicPackage(item) });
}

export async function deletePackage(req, res) {
  const item = await Package.findByIdAndDelete(req.params.packageId);
  if (!item) throw new AppError("Paket topilmadi", 404, "PACKAGE_NOT_FOUND");
  return successResponse(res);
}

export async function getProviderStatus(_req, res) {
  const [lootbarBalance, fragmentBalance, catalog] = await Promise.all([
    getProviderBalance(), getFragmentBalance(), providerCatalog(),
  ]);
  return successResponse(res, {
    connected: true,
    lootbar: {
      balanceUsd: Number(lootbarBalance.data?.total_amount ?? 0),
      pubgOffers: catalog.filter((item) => item.provider === "lootbar").length,
    },
    fragment: {
      balanceTon: Number(fragmentBalance.result?.balance_ton ?? 0),
      balanceUsdt: Number(fragmentBalance.result?.balance_usdt ?? 0),
      telegramPremiumPlans: catalog.filter((item) => item.provider === "fragment").length,
    },
    checkedAt: new Date().toISOString(),
  });
}
