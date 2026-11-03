import assert from "node:assert/strict";
import test from "node:test";

process.env.TELEGRAM_BOT_TOKEN = "9001556548:test-token";
process.env.FRONTEND_URL = "https://flex-shop.example.com";

test("/start response sends the banner, requested caption and Mini App button", async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const { sendStartResponse } = await import(`../src/services/telegramBot.service.js?test=${Date.now()}`);
    await sendStartResponse("123456", true);
  } finally {
    global.fetch = originalFetch;
  }

  assert.match(request.url, /\/sendPhoto$/);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.body.get("chat_id"), "123456");
  assert.ok(request.options.body.get("photo").size > 0);
  assert.equal(
    request.options.body.get("caption"),
    "👋 Assalomu alaykum! FLEX SHOP’ga xush kelibsiz!\n\n🎮 Bizning botimiz orqali PUBG Mobile uchun UC’larni va Telegram Premiumni hamyonbop narxlarda xarid qilishingiz mumkin. Barchasi tez, oson va bir necha bosqichda!\n\n👇 Xaridni boshlash uchun quyidagi tugmani bosing:",
  );
  assert.deepEqual(JSON.parse(request.options.body.get("reply_markup")), {
    inline_keyboard: [[{
      text: "🛍 Xaridni boshlash",
      web_app: { url: "https://flex-shop.example.com" },
    }]],
  });
});
