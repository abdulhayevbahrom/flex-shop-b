import { AppError } from "../utils/AppError.js";

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function adminLoginRateLimit(req, _res, next) {
  const now = Date.now();
  const key = req.ip;
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    req.resetAdminLoginAttempts = () => attempts.delete(key);
    return next();
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return next(new AppError("Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring", 429, "TOO_MANY_LOGIN_ATTEMPTS"));
  }
  entry.count += 1;
  req.resetAdminLoginAttempts = () => attempts.delete(key);
  next();
}
