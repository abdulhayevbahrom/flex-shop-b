import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { getBotEnabled } from "../services/systemSettings.service.js";
import { sendStartResponse } from "../services/telegramBot.service.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";

export async function handleTelegramWebhook(req, res) {
  const secret = req.header("X-Telegram-Bot-Api-Secret-Token");
  if (!env.telegramWebhookSecret || secret !== env.telegramWebhookSecret) {
    throw new AppError("Invalid Telegram webhook secret", 401, "INVALID_TELEGRAM_WEBHOOK_SECRET");
  }
  const message = req.body?.message;
  if (message?.text?.split(/\s+/)[0]?.split("@")[0] === "/start" && message.from?.id) {
    await User.findOneAndUpdate(
      { telegramId: String(message.from.id) },
      { $set: { username: message.from.username ?? "", firstName: message.from.first_name ?? "", lastName: message.from.last_name ?? "", languageCode: message.from.language_code ?? "uz", hasStartedBot: true, botStartedAt: new Date() } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    await sendStartResponse(message.chat.id, await getBotEnabled(), message.from.first_name ?? "");
  }
  return successResponse(res, { received: true });
}
