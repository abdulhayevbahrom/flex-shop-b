import assert from "node:assert/strict";
import test from "node:test";

process.env.LOOTBAR_NICKNAME = "U1000000000";
process.env.LOOTBAR_EMAIL = "reseller@example.com";
process.env.LOOTBAR_PASSWORD = "test-password";
process.env.LOOTBAR_CALLBACK_URL = "https://shop.example.com/api/webhooks/lootbar/notify";

test("Lootbar PUBG flow reuses auth and sends verified role data", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, path, options, body });

    let payload;
    if (path.endsWith("/login")) {
      payload = { status: "ok", data: { token: "token-1", callback_key: "callback-secret", expire_at: Math.floor(Date.now() / 1000) + 3600 } };
    } else if (path.endsWith("/games")) {
      payload = { status: "ok", data: { items: [{ game_id: "1002", game_name: "PUBG MOBILE", login_template: null }], total_page: 1 } };
    } else if (path.endsWith("/skus")) {
      payload = { status: "ok", data: { items: [{ sku_id: "10910", sku_name: "60 UC", origin_price: "0.99", reseller_price: "0.90", extra_info: [{ name: "uid", required: true }] }] } };
    } else if (path.endsWith("/check_roles")) {
      payload = { status: "ok", data: { hostid: "global", roleid: "123456789", nickname: "PUBG Player" } };
    } else if (path.endsWith("/create_order")) {
      payload = { status: "ok", data: { order_id: "T100" } };
    } else {
      throw new Error(`Unexpected URL: ${url}`);
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };

  const service = await import(`../src/services/lootbar.service.js?test=${Date.now()}`);
  const catalog = await service.getPubgCatalog();
  assert.equal(catalog.category.category_id, "1002");
  assert.equal(catalog.offers.offers[0].price_usd, 0.9);

  const player = await service.validatePlayer("1002", { player_id: "123456789" });
  assert.equal(player.valid, true);
  assert.equal(player.player_name, "PUBG Player");

  const created = await service.createPubgOrder({
    categoryId: "1002",
    offerId: "10910",
    fields: { player_id: "123456789" },
    key: "merchant-order-1",
  });
  assert.equal(created.order.order_id, "T100");
  assert.equal(created.order.reference_id, "merchant-order-1");

  const loginCalls = calls.filter((call) => call.path.endsWith("/login"));
  assert.equal(loginCalls.length, 1);
  const protectedCalls = calls.filter((call) => !call.path.endsWith("/login"));
  assert.ok(protectedCalls.every((call) => call.options.headers.Authorization === "PS token-1"));

  const roleCall = calls.find((call) => call.path.endsWith("/check_roles"));
  assert.deepEqual(roleCall.body, { game_id: "1002", login_data: { uid: "123456789" } });
  const orderCall = calls.find((call) => call.path.endsWith("/create_order"));
  assert.deepEqual(orderCall.body.extra_info, { uid: "123456789", hostid: "global", roleid: "123456789" });
  assert.equal(orderCall.body.callback_url, process.env.LOOTBAR_CALLBACK_URL);

  assert.equal(service.mapLootbarState(2), "completed");
  assert.equal(service.mapLootbarState(3), "failed");
  assert.equal(service.mapLootbarState(5), "partial");
});
