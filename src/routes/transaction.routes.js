import { Router } from "express";
import { listTransactions } from "../controllers/transaction.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.get("/", asyncHandler(listTransactions));
export default router;
