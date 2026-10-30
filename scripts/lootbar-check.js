import { getProviderBalance, getPubgCatalog } from "../src/services/lootbar.service.js";

try {
  const [balance, pubg] = await Promise.all([getProviderBalance(), getPubgCatalog()]);
  console.log(JSON.stringify({
    connected: true,
    balanceUsd: Number(balance.data?.total_amount ?? 0),
    pubgGameId: pubg.category.category_id,
    pubgOffers: pubg.offers.offers.length,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    connected: false,
    code: error.code ?? "UNKNOWN_ERROR",
    message: error.message,
  }, null, 2));
  process.exitCode = 1;
}
