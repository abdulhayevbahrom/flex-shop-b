import { getTelegramUser } from "../services/fragmentApi.service.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";

export async function verifyTelegramUser(req, res) {
  const username = String(req.body.username ?? "").trim();
  if (!/^@[A-Za-z0-9_]{5,}$/.test(username)) {
    throw new AppError("Invalid Telegram username", 400, "INVALID_USERNAME");
  }

  let user;
  try {
    user = await getTelegramUser(username);
  } catch (error) {
    const notFoundCodes = new Set(["USER_NOT_FOUND", "USERNAME_NOT_FOUND", "NOT_FOUND"]);
    if ([400, 404, 422].includes(error?.statusCode) || notFoundCodes.has(error?.code)) {
      throw new AppError("Telegram profile not found", 404, "TELEGRAM_USER_NOT_FOUND");
    }
    throw error;
  }

  if (!user?.username && !user?.name) {
    throw new AppError("Telegram profile not found", 404, "TELEGRAM_USER_NOT_FOUND");
  }

  return successResponse(res, {
    profile: {
      username: `@${String(user.username || username).replace(/^@/, "")}`,
      name: String(user.name ?? "").trim(),
    },
  });
}
