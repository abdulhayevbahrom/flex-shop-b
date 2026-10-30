import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "9001556548:test-token";

function signedInitData(fields) {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(process.env.TELEGRAM_BOT_TOKEN)
    .digest();
  params.set("hash", crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex"));
  return params.toString();
}

test("Telegram initData validation includes the new signature field in bot-token HMAC", async () => {
  const { parseAndVerifyInitData } = await import(`../src/middleware/auth.js?test=${Date.now()}`);
  const user = { id: 123456789, first_name: "Bahromjon", username: "bahromjon_abdulhayev" };
  const initData = signedInitData({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAE2E",
    signature: "telegram-ed25519-signature",
    user: JSON.stringify(user),
  });

  assert.deepEqual(parseAndVerifyInitData(initData), user);
});
