import crypto from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const cache = new Map();

function providerError(payload, response) {
  const code = payload?.code ?? "FRAGMENT_API_ERROR";
  const outcomeUnknown = response.status >= 502 || ["FRAGMENT_TIMEOUT", "CRITICAL_SERVER_ERROR"].includes(code);
  return new AppError(
    payload?.message || "Fragment API request failed",
    response.status >= 500 ? 502 : response.status,
    code,
    { providerPayload: payload, ...(outcomeUnknown ? { outcomeUnknown: true } : {}) },
  );
}

async function request(path, body = {}) {
  if (!env.fragmentApiKey) {
    throw new AppError("Fragment API is not configured", 503, "FRAGMENT_NOT_CONFIGURED");
  }
  let response;
  try {
    response = await fetch(`${env.fragmentApiBaseUrl}${path}`, {
      method: "POST",
      signal: AbortSignal.timeout(env.fragmentApiTimeoutMs),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": env.fragmentApiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new AppError(
      error?.name === "TimeoutError" ? "Fragment API request timed out" : "Fragment API network error",
      502,
      error?.name === "TimeoutError" ? "FRAGMENT_TIMEOUT" : "FRAGMENT_NETWORK_ERROR",
      { outcomeUnknown: true, cause: error?.message || String(error) },
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok !== true) throw providerError(payload, response);
  return payload;
}

async function cached(key, loader) {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + env.catalogCacheTtlMs });
  return value;
}

export async function getTelegramUser(username) {
  const payload = await request("/getInfo", { username: String(username).replace(/^@/, "") });
  return payload.result;
}

export async function getTelegramPremiumPlans() {
  const payload = await cached("premium-pricing", () => request("/premium/pricing"));
  return {
    plans: (payload.result?.packages ?? []).map((item) => ({
      months: Number(item.months),
      price_usd: Number(item.usd),
      price_ton: Number(item.ton),
    })),
  };
}

export async function createTelegramPremiumOrder({ username, months, key }) {
  const payload = await request("/premium/buy", {
    username: String(username).replace(/^@/, ""),
    duration: Number(months),
  });
  return {
    ...payload,
    order: {
      id: `fragment-${crypto.createHash("sha256").update(String(key ?? crypto.randomUUID())).digest("hex").slice(0, 24)}`,
      reference_id: String(key ?? ""),
      status: "completed",
      ...payload.result,
    },
  };
}

export function getFragmentBalance() {
  return request("/wallet/balance");
}
