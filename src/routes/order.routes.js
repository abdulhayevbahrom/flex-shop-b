import { Router } from "express";
import {
  createOrder,
  createPaymentOrder,
  getOrder,
  listOrders,
} from "../controllers/order.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.get("/", asyncHandler(listOrders));
router.post("/payment", asyncHandler(createPaymentOrder));
router.get("/:orderId", asyncHandler(getOrder));
router.post("/", asyncHandler(createOrder));
export default router;
