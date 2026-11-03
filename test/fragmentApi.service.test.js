import assert from "node:assert/strict";
import test from "node:test";

process.env.FRAGMENT_API_KEY = "fragment-test-key";

test("Fragment API verifies username, reads Premium prices and buys a gift", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(options.body);
    calls.push({ path, body, headers: options.headers });
    const result = path.endsWith("/getInfo")
      ? { username: "durov", name: "Pavel Durov", is_premium: true }
      : path.endsWith("/premium/pricing")
        ? { packages: [{ months: 3, ton: "5", usd: "11.99" }, { months: 6, ton: "6.67", usd: "15.99" }] }
        : { username: "durov", duration: 3, payment_method: "TON", cost: "5" };
    return new Response(JSON.stringify({ ok: true, message: "OK", result }), { status: 200 });
  };

  const service = await import(`../src/services/fragmentApi.service.js?test=${Date.now()}`);
  const user = await service.getTelegramUser("@durov");
  assert.equal(user.name, "Pavel Durov");
  const plans = await service.getTelegramPremiumPlans();
  assert.deepEqual(plans.plans[0], { months: 3, price_usd: 11.99, price_ton: 5 });
  const purchase = await service.createTelegramPremiumOrder({ username: "@durov", months: 3, key: "order-1" });
  assert.equal(purchase.order.status, "completed");
  assert.deepEqual(calls.find((call) => call.path.endsWith("/premium/buy")).body, { username: "durov", duration: 3 });
  assert.ok(calls.every((call) => call.headers["X-API-Key"] === "fragment-test-key"));
});

test("Fragment API marks 502 purchase outcome as unknown", async () => {
  global.fetch = async () => new Response(JSON.stringify({
    ok: false,
    message: "To'lov yuborildi, tasdiq kutilmoqda",
    code: "FRAGMENT_TIMEOUT",
  }), { status: 502 });
  const service = await import(`../src/services/fragmentApi.service.js?error=${Date.now()}`);
  await assert.rejects(
    service.createTelegramPremiumOrder({ username: "durov", months: 3, key: "order-2" }),
    (error) => error.code === "FRAGMENT_TIMEOUT" && error.details?.outcomeUnknown === true,
  );
});

test("Fragment API marks network failures as unknown purchase outcomes", async () => {
  global.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const service = await import(`../src/services/fragmentApi.service.js?network=${Date.now()}`);
  await assert.rejects(
    service.createTelegramPremiumOrder({ username: "durov", months: 3, key: "order-3" }),
    (error) => error.code === "FRAGMENT_NETWORK_ERROR" && error.details?.outcomeUnknown === true,
  );
});

test("Fragment API maps a missing Telegram user to a safe 404", async () => {
  global.fetch = async () => new Response(JSON.stringify({
    ok: false,
    message: "Telegram foydalanuvchi topilmadi.",
    code: "FRAGMENT_ERROR",
  }), { status: 502 });
  const service = await import(`../src/services/fragmentApi.service.js?notfound=${Date.now()}`);
  await assert.rejects(
    service.getTelegramUser("@missing_user"),
    (error) => error.code === "TELEGRAM_USER_NOT_FOUND" && error.statusCode === 404 && !error.details?.outcomeUnknown,
  );
});
