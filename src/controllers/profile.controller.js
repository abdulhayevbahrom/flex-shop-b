import { successResponse } from "../utils/responses.js";

export function getProfile(req, res) {
  const user = req.user.toJSON();
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
    },
  });
}
