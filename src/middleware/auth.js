import crypto from "node:crypto";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";

export function parseAndVerifyInitData(initData) {
  if (!env.telegramBotToken) {
    throw new AppError("Telegram bot token is not configured", 503, "AUTH_NOT_CONFIGURED");
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) {
    throw new AppError("Telegram hash is missing", 401, "INVALID_TELEGRAM_AUTH");
  }

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(env.telegramBotToken)
    .digest();
  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const received = Buffer.from(receivedHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw new AppError("Invalid Telegram signature", 401, "INVALID_TELEGRAM_AUTH");
  }

  const authDate = Number(params.get("auth_date"));
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (!authDate || age < 0 || age > env.telegramAuthMaxAgeSeconds) {
    throw new AppError("Telegram authorization has expired", 401, "TELEGRAM_AUTH_EXPIRED");
  }

  try {
    return JSON.parse(params.get("user") ?? "null");
  } catch {
    throw new AppError("Invalid Telegram user data", 401, "INVALID_TELEGRAM_AUTH");
  }
}

function developmentUser(req) {
  if (env.nodeEnv === "production") return null;
  const telegramId = req.header("X-Dev-Telegram-Id");
  if (!telegramId) return null;
  return {
    id: telegramId,
    username: req.header("X-Dev-Username") ?? "dev_user",
    first_name: req.header("X-Dev-First-Name") ?? "Developer",
  };
}

export async function authenticate(req, _res, next) {
  try {
    const initData = req.header("X-Telegram-Init-Data");
    const telegramUser = initData
      ? parseAndVerifyInitData(initData)
      : developmentUser(req);

    if (!telegramUser?.id) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }

    const userUpdates = {
      username: telegramUser.username ?? "",
      firstName: telegramUser.first_name ?? "",
      lastName: telegramUser.last_name ?? "",
      languageCode: telegramUser.language_code ?? "uz",
      hasStartedBot: true,
    };
    if (typeof telegramUser.photo_url === "string" && telegramUser.photo_url.trim()) {
      userUpdates.photoUrl = telegramUser.photo_url;
    }

    const user = await User.findOneAndUpdate(
      { telegramId: String(telegramUser.id) },
      {
        $set: userUpdates,
      },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
    );

    if (user.isBlocked) {
      throw new AppError("User is blocked", 403, "USER_BLOCKED");
    }
    req.user = user;
    req.telegramUser = telegramUser;
    next();
  } catch (error) {
    next(error);
  }
}
