import { getFragmentBalance, getTelegramPremiumPlans } from "../src/services/fragmentApi.service.js";

try {
  const [balance, premium] = await Promise.all([getFragmentBalance(), getTelegramPremiumPlans()]);
  console.log(JSON.stringify({
    connected: true,
    balanceTon: Number(balance.result?.balance_ton ?? 0),
    balanceUsdt: Number(balance.result?.balance_usdt ?? 0),
    telegramPremiumPlans: premium.plans,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    connected: false,
    code: error.code,
    message: error.message,
    cause: error.cause ? { code: error.cause.code, message: error.cause.message } : undefined,
  }, null, 2));
  process.exitCode = 1;
}
