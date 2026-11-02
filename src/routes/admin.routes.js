import { Router } from "express";
import {
  listPaymentNotifications,
  updateTopUpStatus,
} from "../controllers/admin.controller.js";
import { getAdminSession, loginAdmin, loginAdminWithTelegram, logoutAdmin } from "../controllers/adminAuth.controller.js";
import { createPackage, deletePackage, getProviderStatus, listPackages, listProviderPackages, updatePackage } from "../controllers/adminPackage.controller.js";
import { getAdminOrder, getAdminStatistics, getBotStatus, listAdminOrders, updateBotStatus } from "../controllers/adminOperations.controller.js";
import { createPaymentCard, deletePaymentCard, listPaymentCards, updatePaymentCard } from "../controllers/adminPaymentCard.controller.js";
import { adminAuth } from "../middleware/adminAuth.js";
import { authenticate } from "../middleware/auth.js";
import { adminLoginRateLimit } from "../middleware/adminLoginRateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.post("/auth/login", adminLoginRateLimit, authenticate, asyncHandler(loginAdmin));
router.post("/auth/telegram", authenticate, asyncHandler(loginAdminWithTelegram));
router.use(adminAuth);
router.get("/auth/me", getAdminSession);
router.post("/auth/logout", logoutAdmin);
router.get("/packages", asyncHandler(listPackages));
router.get("/provider-packages", asyncHandler(listProviderPackages));
router.get("/provider", asyncHandler(getProviderStatus));
router.post("/packages", asyncHandler(createPackage));
router.patch("/packages/:packageId", asyncHandler(updatePackage));
router.delete("/packages/:packageId", asyncHandler(deletePackage));
router.get("/bot", asyncHandler(getBotStatus));
router.patch("/bot", asyncHandler(updateBotStatus));
router.get("/orders", asyncHandler(listAdminOrders));
router.get("/orders/:orderId", asyncHandler(getAdminOrder));
router.get("/statistics", asyncHandler(getAdminStatistics));
router.get("/payment-cards", asyncHandler(listPaymentCards));
router.post("/payment-cards", asyncHandler(createPaymentCard));
router.patch("/payment-cards/:cardId", asyncHandler(updatePaymentCard));
router.delete("/payment-cards/:cardId", asyncHandler(deletePaymentCard));
router.get("/payment-notifications", asyncHandler(listPaymentNotifications));
router.patch("/top-ups/:topUpId", asyncHandler(updateTopUpStatus));
export default router;
