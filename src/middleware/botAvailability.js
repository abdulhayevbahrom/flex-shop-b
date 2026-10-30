import { getBotEnabled } from "../services/systemSettings.service.js";
import { AppError } from "../utils/AppError.js";

export async function botAvailability(_req, _res, next) {
  try {
    if (!(await getBotEnabled())) {
      throw new AppError("Bot vaqtincha o‘chirilgan", 503, "BOT_DISABLED");
    }
    next();
  } catch (error) {
    next(error);
  }
}
