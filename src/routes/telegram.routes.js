import { Router } from "express";
import { verifyTelegramUser } from "../controllers/telegram.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.post("/verify", asyncHandler(verifyTelegramUser));
export default router;
