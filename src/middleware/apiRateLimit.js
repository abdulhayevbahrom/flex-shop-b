import { AppError } from "../utils/AppError.js";

const MAX_TRACKED_CLIENTS = 10_000;

function pruneExpired(store, now) {
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export function createApiRateLimit({
  windowMs,
  maxRequests,
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || "unknown",
  clock = Date.now,
  store = new Map(),
} = {}) {
  let lastPruneAt = 0;

  return function apiRateLimit(req, res, next) {
    if (!maxRequests) return next();

    const now = clock();
    if (now - lastPruneAt >= windowMs) {
      pruneExpired(store, now);
      lastPruneAt = now;
    }

    const key = String(keyGenerator(req));
    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      if (!entry && store.size >= MAX_TRACKED_CLIENTS) {
        pruneExpired(store, now);
        if (store.size >= MAX_TRACKED_CLIENTS) {
          store.delete(store.keys().next().value);
        }
      }
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, maxRequests - entry.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return next(new AppError(
        "Juda ko‘p so‘rov yuborildi. Birozdan keyin qayta urinib ko‘ring",
        429,
        "TOO_MANY_REQUESTS",
      ));
    }

    return next();
  };
}
