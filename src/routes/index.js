import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import orderRoutes from "./order.routes.js";
import playerRoutes from "./player.routes.js";
import productRoutes from "./product.routes.js";
import profileRoutes from "./profile.routes.js";
import topUpRoutes from "./topUp.routes.js";
import transactionRoutes from "./transaction.routes.js";
import telegramRoutes from "./telegram.routes.js";

const router = Router();
router.use(authenticate);
router.use("/profile", profileRoutes);
router.use("/products", productRoutes);
router.use("/players", playerRoutes);
router.use("/orders", orderRoutes);
router.use("/top-ups", topUpRoutes);
router.use("/transactions", transactionRoutes);
router.use("/telegram", telegramRoutes);

export default router;
