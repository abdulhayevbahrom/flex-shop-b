import { Router } from "express";
import { getProducts } from "../controllers/product.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.get("/", asyncHandler(getProducts));
export default router;
