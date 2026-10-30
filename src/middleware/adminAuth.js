import jwt from "jsonwebtoken";
import { Admin } from "../models/Admin.js";
import { AppError } from "../utils/AppError.js";
import { getAdminJwtSecret } from "../services/adminSecurity.service.js";

export const ADMIN_COOKIE_NAME = "admin_session";

export async function adminAuth(req, _res, next) {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) {
    return next(new AppError("Admin authorization required", 401, "ADMIN_UNAUTHORIZED"));
  }
  try {
    const payload = jwt.verify(token, await getAdminJwtSecret(), {
      algorithms: ["HS256"], issuer: "flex-shop-api", audience: "flex-shop-admin",
    });
    const admin = await Admin.findOne({ _id: payload.sub, isActive: true });
    if (!admin) throw new Error("Admin not found");
    req.admin = admin;
    next();
  } catch {
    next(new AppError("Admin session is invalid or expired", 401, "ADMIN_UNAUTHORIZED"));
  }
}
