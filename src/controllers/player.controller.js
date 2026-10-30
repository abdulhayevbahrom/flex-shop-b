import { getPubgCatalog, validatePlayer } from "../services/lootbar.service.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";

export async function verifyPlayer(req, res) {
  const playerId = String(req.body.playerId ?? "").trim();
  if (!/^\d{6,}$/.test(playerId)) {
    throw new AppError("Player ID must contain at least 6 digits", 400, "INVALID_PLAYER_ID");
  }

  const { category } = await getPubgCatalog();
  const result = await validatePlayer(category.category_id, { player_id: playerId });
  if (!result.valid) {
    throw new AppError("Player ID was not found", 422, "PLAYER_NOT_FOUND");
  }

  return successResponse(res, {
    player: {
      id: playerId,
      name: result.player_name ?? "",
      region: result.region ?? null,
    },
  });
}
