import "dotenv/config";

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number`);
  }
  return value;
};

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: numberFromEnv("PORT", 5455),
  mongoUri: process.env.MONGO_URI ?? "",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  telegramWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL ?? "",
  adminTelegramIds: (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index),
  adminSessionHours: numberFromEnv("ADMIN_SESSION_HOURS", 12),
  telegramAuthMaxAgeSeconds: numberFromEnv(
    "TELEGRAM_AUTH_MAX_AGE_SECONDS",
    86400,
  ),
  humoUserbotEnabled: process.env.HUMO_USERBOT_ENABLED === "true",
  telegramApiId: numberFromEnv("TELEGRAM_API_ID", 0),
  telegramApiHash: process.env.TELEGRAM_API_HASH ?? "",
  telegramUserSession: process.env.TELEGRAM_USER_SESSION ?? "",
  humoBotUsername: (process.env.HUMO_BOT_USERNAME ?? "HUMOcardbot")
    .replace(/^@/, "")
    .toLowerCase(),
  paymentBotUsernames: (
    process.env.PAYMENT_BOT_USERNAMES ??
    `${process.env.HUMO_BOT_USERNAME ?? "HUMOcardbot"},CardXabarBot`
  )
    .split(",")
    .map((item) => item.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index),
  humoCreditKeywords: (
    process.env.HUMO_CREDIT_KEYWORDS ??
    "tushdi,kirim,popolnen,zachislen,credited,пополнен,зачислен,поступил"
  )
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
  humoDebitKeywords: (
    process.env.HUMO_DEBIT_KEYWORDS ?? "yechildi,chiqim,spisan,debit,списан"
  )
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
  humoPaymentCodeMax: numberFromEnv("HUMO_PAYMENT_CODE_MAX", 999),
  humoPaymentAmountStep: numberFromEnv("HUMO_PAYMENT_AMOUNT_STEP", 100),
  lootbarBaseUrl: process.env.LOOTBAR_BASE_URL ?? "https://api.lootbar.gg",
  lootbarNickname: process.env.LOOTBAR_NICKNAME ?? "",
  lootbarEmail: process.env.LOOTBAR_EMAIL ?? "",
  lootbarPassword: process.env.LOOTBAR_PASSWORD ?? "",
  lootbarCallbackUrl: process.env.LOOTBAR_CALLBACK_URL ?? "",
  lootbarTimeoutMs: numberFromEnv("LOOTBAR_TIMEOUT_MS", 15000),
  volseverApiKey: process.env.VOLSEVER_API_KEY ?? "",
  volseverBaseUrl: process.env.VOLSEVER_BASE_URL ?? "https://gate.volsever.com",
  fragmentApiBaseUrl:
    process.env.FRAGMENT_API_BASE_URL ?? "https://fragment-api.uz/api/v1",
  fragmentApiKey: process.env.FRAGMENT_API_KEY ?? "",
  fragmentApiTimeoutMs: numberFromEnv("FRAGMENT_API_TIMEOUT_MS", 30000),
  catalogCacheTtlMs: numberFromEnv("CATALOG_CACHE_TTL_MS", 600000),
  topUpCardLabel: process.env.TOPUP_CARD_LABEL ?? "UZCARD / HUMO",
  topUpCardNumber: process.env.TOPUP_CARD_NUMBER ?? "",
  topUpCardHolder: process.env.TOPUP_CARD_HOLDER ?? "",
  topUpMinAmountUzs: numberFromEnv("TOPUP_MIN_AMOUNT_UZS", 10000),
});

export function validateEnv() {
  const missing = [];
  if (!env.mongoUri) missing.push("MONGO_URI");
  if (env.nodeEnv === "production" && !env.telegramBotToken) {
    missing.push("TELEGRAM_BOT_TOKEN");
  }
  if (env.nodeEnv === "production" && !env.telegramWebhookSecret) {
    missing.push("TELEGRAM_WEBHOOK_SECRET");
  }
  if (env.nodeEnv === "production" && !env.telegramWebhookUrl) {
    missing.push("TELEGRAM_WEBHOOK_URL");
  }
  if (env.nodeEnv === "production" && !env.lootbarNickname)
    missing.push("LOOTBAR_NICKNAME");
  if (env.nodeEnv === "production" && !env.lootbarEmail)
    missing.push("LOOTBAR_EMAIL");
  if (env.nodeEnv === "production" && !env.lootbarPassword)
    missing.push("LOOTBAR_PASSWORD");
  if (env.nodeEnv === "production" && !env.lootbarCallbackUrl)
    missing.push("LOOTBAR_CALLBACK_URL");
  if (env.nodeEnv === "production" && !env.fragmentApiKey)
    missing.push("FRAGMENT_API_KEY");
  if (env.humoUserbotEnabled) {
    if (!env.telegramApiId) missing.push("TELEGRAM_API_ID");
    if (!env.telegramApiHash) missing.push("TELEGRAM_API_HASH");
    if (!env.telegramUserSession) missing.push("TELEGRAM_USER_SESSION");
  }
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}
