import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env, validateEnv } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authenticate } from "./middleware/auth.js";
import { botAvailability } from "./middleware/botAvailability.js";
import { createApiRateLimit } from "./middleware/apiRateLimit.js";
import { notFound } from "./middleware/notFound.js";
import apiRoutes from "./routes/index.js";
import adminRoutes from "./routes/admin.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import {
  startHumoUserbot,
  stopHumoUserbot,
} from "./services/humoUserbot.service.js";
import {
  startPaymentExpiryWorker,
  stopPaymentExpiryWorker,
} from "./services/paymentExpiry.service.js";
import { successResponse } from "./utils/responses.js";
import { ensureInitialAdmin } from "./services/adminBootstrap.service.js";
import { getBotEnabled } from "./services/systemSettings.service.js";
import { configureTelegramWebhook } from "./services/telegramBot.service.js";
import { ensureInitialPaymentCard } from "./services/paymentCard.service.js";
import { startOrderStatusSyncWorker, stopOrderStatusSyncWorker } from "./services/orderStatusSync.service.js";

validateEnv();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: env.frontendUrl.split(",").map((origin) => origin.trim()),
    credentials: true,
  }),
);
// Webhook raw body imzo tekshiruvi uchun JSON parserdan oldin turishi shart. .  
app.use("/api/webhooks", webhookRoutes);  
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());



app.get("/api/health", (_req, res) =>
  successResponse(res, {
    service: "flex-shop-api",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  }),
);
app.use("/api", createApiRateLimit({
  windowMs: env.apiRateLimitWindowMs,
  maxRequests: env.apiRateLimitMaxRequests,
}));
app.get("/api/bot/status", authenticate, async (_req, res, next) => {
  try {
    const enabled = await getBotEnabled();
    return successResponse(res, {
      enabled,
      message: enabled ? "Bot ishlayapti" : "Botda hozirda texnik ishlar olib borilmoqda. Iltimos, birozdan keyin qayta urinib ko‘ring.",
    });
  } catch (error) { next(error); }
});
app.use("/api/admin", adminRoutes);
app.use("/api", botAvailability);
app.use("/api", apiRoutes);
app.use(notFound);
app.use(errorHandler);

let server;

async function start() {
  await connectDatabase();
  await ensureInitialAdmin();
  await ensureInitialPaymentCard();
  await configureTelegramWebhook();
  startPaymentExpiryWorker();
  startOrderStatusSyncWorker();
  await startHumoUserbot();
  server = app.listen(env.port, () => {
    console.log(`Flex Shop API listening on http://localhost:${env.port}`);
  });
}

async function shutdown(signal) {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  stopPaymentExpiryWorker();
  stopOrderStatusSyncWorker();
  await stopHumoUserbot();
  await disconnectDatabase();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});

export { app };
