import { Router, json, raw } from "express";
import { handleLootbarWebhook } from "../controllers/webhook.controller.js";
import { handleTelegramWebhook } from "../controllers/telegramWebhook.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.post("/telegram", json({ limit: "128kb" }), asyncHandler(handleTelegramWebhook));
router.post(
  "/lootbar/notify",
  raw({ type: "application/json", limit: "256kb" }),
  asyncHandler(handleLootbarWebhook),
);
export default router;
