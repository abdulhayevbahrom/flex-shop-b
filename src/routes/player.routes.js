import { Router } from "express";
import { verifyPlayer } from "../controllers/player.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.post("/verify", asyncHandler(verifyPlayer));
export default router;
