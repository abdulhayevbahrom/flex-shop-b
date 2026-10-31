import { Router } from "express";
import { createTopUp, getTopUp, listTopUps } from "../controllers/topUp.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.get("/", asyncHandler(listTopUps));
router.get("/:topUpId", asyncHandler(getTopUp));
router.post("/", asyncHandler(createTopUp));
export default router;
