import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { User } from "../models/User.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const startBannerPath = fileURLToPath(new URL("../../assets/start-banner.jpg", import.meta.url));
const startCaption = `👋 Assalomu alaykum! FLEX SHOP’ga xush kelibsiz!

🎮 Bizning botimiz orqali PUBG Mobile uchun UC’larni va Telegram Premiumni hamyonbop narxlarda xarid qilishingiz mumkin. Barchasi tez, oson va bir necha bosqichda!

👇 Xaridni boshlash uchun quyidagi tugmani bosing:`;

async function telegramRequest(method, body) {
  if (!env.telegramBotToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.description ?? "Telegram API request failed");
    error.retryAfter = payload.parameters?.retry_after;
    error.status = response.status;
    throw error;
  }
  return payload.result;
}

export function sendBotMessage(chatId, text, options = {}) {
  return telegramRequest("sendMessage", { chat_id: chatId, text, ...options });
}

async function sendBotPhoto(chatId, photoPath, caption, options = {}) {
  if (!env.telegramBotToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const photo = await readFile(photoPath);
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([photo], { type: "image/jpeg" }), "start-banner.jpg");
  form.append("caption", caption);
  for (const [key, value] of Object.entries(options)) {
    form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }

  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendPhoto`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.description ?? "Telegram API request failed");
    error.retryAfter = payload.parameters?.retry_after;
    error.status = response.status;
    throw error;
  }
  return payload.result;
}

export async function configureTelegramWebhook() {
  if (!env.telegramBotToken || !env.telegramWebhookUrl || !env.telegramWebhookSecret) {
    return;
  }
  try {
    await telegramRequest("setWebhook", {
      url: env.telegramWebhookUrl,
      secret_token: env.telegramWebhookSecret,
      allowed_updates: ["message"],
    });
  } catch (error) {
    console.error("Telegram webhook configuration failed", error.message);
  }
}

export async function sendStartResponse(chatId, enabled) {
  if (!enabled) {
    return sendBotMessage(chatId, "🛠 Botda hozirda texnik ishlar olib borilmoqda. Iltimos, birozdan keyin qayta urinib ko‘ring.");
  }
  const options = {
    reply_markup: {
      inline_keyboard: [[{ text: "🛍 Xaridni boshlash", web_app: { url: env.frontendUrl.split(",")[0].trim() } }]],
    },
  };
  try {
    return await sendBotPhoto(chatId, startBannerPath, startCaption, options);
  } catch (error) {
    console.error("Telegram start banner failed; sending text fallback", error.message);
    return sendBotMessage(chatId, startCaption, options);
  }
}

let broadcastRunning = false;

export function broadcastBotStarted() {
  if (broadcastRunning) return false;
  broadcastRunning = true;
  void (async () => {
    try {
      const cursor = User.find({ telegramId: { $exists: true, $ne: "" } }).select("telegramId").lean().cursor();
      for await (const user of cursor) {
        try {
          await sendBotMessage(user.telegramId, "✅ Bot ishga tushdi! Endi Flex Shopʼga kirib savdo qilishingiz mumkin.", {
            reply_markup: {
              inline_keyboard: [[{ text: "🛍 Savdo qilish", web_app: { url: env.frontendUrl.split(",")[0].trim() } }]],
            },
          });
        } catch (error) {
          if (error.retryAfter) {
            await sleep(error.retryAfter * 1000);
            try { await sendBotMessage(user.telegramId, "✅ Bot ishga tushdi! Endi Flex Shopʼga kirib savdo qilishingiz mumkin."); }
            catch {}
          }
        }
        await sleep(40);
      }
    } catch (error) {
      console.error("Telegram broadcast failed", error);
    } finally {
      broadcastRunning = false;
    }
  })();
  return true;
}
