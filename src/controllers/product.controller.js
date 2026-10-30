import { Package } from "../models/Package.js";
import { successResponse } from "../utils/responses.js";

export async function getProducts(_req, res) {
  const items = await Package.find({ visible: true }).sort({ sortOrder: 1, createdAt: 1 });
  const pubg = items.filter((item) => item.type === "pubg_uc");
  const premium = items.filter((item) => item.type === "telegram_premium");

  return successResponse(res, {
    products: {
      pubg: {
        categoryId: pubg[0]?.providerCategoryId ?? "",
        name: "PUBG Mobile UC",
        fields: [{ name: "player_id", label: "Player ID", type: "text", required: true }],
        offers: pubg.map((item) => ({
          id: item.providerProductId,
          name: item.name,
          priceUzs: item.retailPriceUzs,
        })),
      },
      telegramPremium: premium.map((item) => ({
        months: item.metadata?.months,
        name: item.name,
        priceUzs: item.retailPriceUzs,
      })),
    },
  });
}
