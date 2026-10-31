import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ADMIN_COOKIE_NAME } from "../middleware/adminAuth.js";
import { Admin } from "../models/Admin.js";
import { AppError } from "../utils/AppError.js";
import { successResponse } from "../utils/responses.js";
import { getAdminJwtSecret } from "../services/adminSecurity.service.js";

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: env.nodeEnv === "production" ? "strict" : "lax",
  maxAge: env.adminSessionHours * 60 * 60 * 1000,
  path: "/",
});

async function createAdminToken(admin) {
  return jwt.sign({}, await getAdminJwtSecret(), {
    algorithm: "HS256", subject: admin.id, issuer: "flex-shop-api",
    audience: "flex-shop-admin", expiresIn: `${env.adminSessionHours}h`,
  });
}

export async function loginAdmin(req, res) {
  const username = String(req.body.username ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  const admin = await Admin.findOne({ username, isActive: true });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    throw new AppError("Login yoki parol noto‘g‘ri", 401, "INVALID_CREDENTIALS");
  }
  const token = await createAdminToken(admin);
  admin.lastLoginAt = new Date();
  await admin.save();
  req.resetAdminLoginAttempts?.();
  res.cookie(ADMIN_COOKIE_NAME, token, cookieOptions());
  return successResponse(res, { admin: { id: admin.id, username: admin.username }, token });
}

export async function loginAdminWithTelegram(req, res) {
  const admin = await Admin.findOne({ telegramId: req.user.telegramId, isActive: true });
  if (!admin) throw new AppError("Admin access denied", 403, "ADMIN_FORBIDDEN");
  const token = await createAdminToken(admin);
  admin.lastLoginAt = new Date();
  await admin.save();
  res.cookie(ADMIN_COOKIE_NAME, token, cookieOptions());
  return successResponse(res, { admin: { id: admin.id, username: admin.username }, token });
}

export function logoutAdmin(_req, res) {
  res.clearCookie(ADMIN_COOKIE_NAME, { httpOnly: true, secure: env.nodeEnv === "production", sameSite: env.nodeEnv === "production" ? "strict" : "lax", path: "/" });
  return successResponse(res);
}

export function getAdminSession(req, res) {
  return successResponse(res, { admin: { id: req.admin.id, username: req.admin.username } });
}
