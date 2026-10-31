import crypto from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const cache = new Map();
let auth = null;
let loginPromise = null;

function providerError(payload, status = 502) {
  const message = payload?.msg || payload?.message || payload?.error || "Lootbar request failed";
  return new AppError(message, status, "LOOTBAR_ERROR", payload?.data);
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function login() {
  if (!env.lootbarEmail || !env.lootbarPassword || !env.lootbarNickname) {
    throw new AppError("Lootbar API is not configured", 503, "PROVIDER_NOT_CONFIGURED");
  }
  if (auth && auth.expireAt - 60_000 > Date.now()) return auth;
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    const response = await fetch(`${env.lootbarBaseUrl}/api/reseller/login`, {
      method: "POST",
      signal: AbortSignal.timeout(env.lootbarTimeoutMs),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: env.lootbarNickname,
        email: env.lootbarEmail,
        password: env.lootbarPassword,
      }),
    });
    const payload = await readJson(response);
    if (!response.ok || payload.status !== "ok" || !payload.data?.token) {
      throw providerError(payload, response.status >= 500 ? 502 : 401);
    }
    auth = {
      token: payload.data.token,
      callbackKey: payload.data.callback_key || "",
      expireAt: Number(payload.data.expire_at) * 1000,
    };
    return auth;
  })();

  try {
    return await loginPromise;
  } finally {
    loginPromise = null;
  }
}

async function request(path, options = {}, retryAuth = true) {
  const session = await login();
  const response = await fetch(`${env.lootbarBaseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(env.lootbarTimeoutMs),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `PS ${session.token}`,
      ...options.headers,
    },
  });
  const payload = await readJson(response);
  if ((response.status === 401 || response.status === 403) && retryAuth) {
    auth = null;
    return request(path, options, false);
  }
  if (!response.ok || payload.status !== "ok") {
    const status = response.status === 429 ? 503 : response.status >= 500 ? 502 : response.status;
    throw providerError(payload, status || 502);
  }
  return payload;
}

async function cached(key, loader) {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + env.catalogCacheTtlMs });
  return value;
}

async function allGames() {
  return cached("games", async () => {
    const items = [];
    let page = 1;
    do {
      const payload = await request(`/api/reseller/games?page_num=${page}&page_size=100`);
      items.push(...(payload.data?.items ?? []));
      if (page >= Number(payload.data?.total_page ?? 1)) break;
      page += 1;
    } while (page <= 20);
    return items;
  });
}

async function findGame(pattern, unavailableCode) {
  const game = (await allGames()).find((item) => pattern.test(item.game_name ?? ""));
  if (!game) throw new AppError("Provider product is unavailable", 503, unavailableCode);
  return game;
}

async function skusForGame(gameId) {
  const payload = await cached(`skus:${gameId}`, () =>
    request(`/api/reseller/skus?game_id=${encodeURIComponent(gameId)}`),
  );
  return payload.data?.items ?? [];
}

function numericPrice(item) {
  const value = Number(item.reseller_price ?? item.origin_price);
  if (!Number.isFinite(value)) throw new AppError("Lootbar returned an invalid price", 502, "INVALID_PROVIDER_PRICE");
  return value;
}

export async function getPubgCatalog() {
  const game = await findGame(/pubg\s*mobile|^pubg$/i, "PUBG_NOT_AVAILABLE");
  const skus = await skusForGame(game.game_id);
  return {
    category: {
      category_id: String(game.game_id),
      name: game.game_name,
      login_template: game.login_template ?? [],
    },
    offers: {
      offers: skus.map((item) => ({
        ...item,
        offer_id: String(item.sku_id),
        name: item.sku_name,
        price_usd: numericPrice(item),
      })),
    },
  };
}

export async function validatePlayer(gameId, fields) {
  const game = (await allGames()).find((item) => String(item.game_id) === String(gameId));
  let template = game?.login_template ?? [];
  if (!template.length) {
    const skus = await skusForGame(gameId);
    template = skus.find((item) => item.extra_info?.length)?.extra_info ?? [];
  }
  const playerId = fields.player_id ?? fields.uid ?? fields.id;
  if (env.pubgCheckApiKey && String(gameId) === "1004") {
    const response = await fetch(`${env.pubgCheckBaseUrl}/api/v1/check`, {
      method: "POST",
      signal: AbortSignal.timeout(env.lootbarTimeoutMs),
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-API-Key": env.pubgCheckApiKey },
      body: JSON.stringify({ game: "pubg-mobile", user_id: String(playerId) }),
    });
    const payload = await readJson(response);
    if (response.status === 404 || payload.status === "not_found") {
      return { valid: false, player_name: "", region: null, login_data: { uid: playerId }, raw: payload };
    }
    if (!response.ok || payload.status !== "success") {
      throw new AppError(payload.message || "PUBG player check is temporarily unavailable", 503, "PLAYER_CHECK_UNAVAILABLE");
    }
    return {
      valid: true,
      player_name: payload.data?.username ?? "",
      region: payload.data?.region ?? null,
      login_data: { uid: playerId },
      raw: payload,
    };
  }
  const loginData = { ...fields };
  delete loginData.player_id;
  if (playerId !== undefined) {
    const idField = template.find((field) => !/host|server|region/i.test(field.name ?? ""))?.name ?? "id";
    loginData[idField] = playerId;
  }
  const payload = await request("/api/reseller/check_roles", {
    method: "POST",
    body: JSON.stringify({ game_id: String(gameId), login_data: loginData }),
  });
  const data = payload.data ?? {};
  const role = data.role ?? data.roles?.[0] ?? data;
  return {
    valid: data.valid !== false && Boolean(role.roleid ?? role.role_id ?? role.nickname ?? role.role_name),
    player_name: role.nickname ?? role.role_name ?? role.name ?? "",
    region: role.server_name ?? role.region ?? null,
    hostid: role.hostid ?? role.host_id,
    roleid: role.roleid ?? role.role_id,
    login_data: loginData,
    raw: payload,
  };
}

export async function createPubgOrder({ categoryId, offerId, fields, key }) {
  const verification = await validatePlayer(categoryId, fields);
  if (!verification.valid) throw new AppError("Player ID was not found", 422, "PLAYER_NOT_FOUND");
  const extraInfo = { ...verification.login_data };
  if (verification.hostid) extraInfo.hostid = verification.hostid;
  if (verification.roleid) extraInfo.roleid = verification.roleid;
  const referenceId = String(key ?? crypto.randomUUID()).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const payload = await request("/api/reseller/create_order", {
    method: "POST",
    body: JSON.stringify({
      reference_id: referenceId,
      game_id: String(categoryId),
      product: [{ sku_id: String(offerId), num: 1 }],
      extra_info: extraInfo,
      ...(env.lootbarCallbackUrl ? { callback_url: env.lootbarCallbackUrl } : {}),
    }),
  });
  return { ...payload, order: { ...payload.data, reference_id: referenceId } };
}

export async function getProviderOrder(referenceId) {
  return request("/api/reseller/query_order", {
    method: "POST",
    body: JSON.stringify({ reference_id: String(referenceId) }),
  });
}

export function getProviderBalance() {
  return request("/api/reseller/query_asset");
}

export async function getCallbackKey() {
  return (await login()).callbackKey;
}

export function mapLootbarState(state) {
  return ({ 1: "processing", 2: "completed", 3: "failed", 4: "processing", 5: "partial", 6: "cancelled", 7: "cancelled" })[Number(state)] ?? "processing";
}
