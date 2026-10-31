import { successResponse } from "../utils/responses.js";
import { Admin } from "../models/Admin.js";

export async function getProfile(req, res) {
  const user = req.user.toJSON();
  const isAdmin = Boolean(await Admin.exists({ telegramId: user.telegramId, isActive: true }));
  return successResponse(res, {
    user: {
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      photoUrl: user.photoUrl,
      languageCode: user.languageCode,
      balanceUzs: user.balanceUzs,
      isAdmin,
    },
  });
}
