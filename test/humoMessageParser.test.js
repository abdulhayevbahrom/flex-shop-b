import assert from "node:assert/strict";
import test from "node:test";
import { parseHumoMessage } from "../src/utils/humoMessageParser.js";

const options = {
  creditKeywords: ["tushdi", "kirim", "зачислен"],
  debitKeywords: ["yechildi", "chiqim", "списан"],
};

test("UZS kirim xabaridan summani ajratadi", () => {
  assert.deepEqual(parseHumoMessage("Kartaga 20 137 UZS tushdi", options), {
    direction: "credit",
    amountUzs: 20137,
    text: "Kartaga 20 137 UZS tushdi",
  });
});

test("chiqim xabarini balansga yozmaydi", () => {
  assert.equal(
    parseHumoMessage("Kartadan 13 000 UZS yechildi", options).direction,
    "debit",
  );
});

test("noma'lum xabarni unknown qiladi", () => {
  assert.deepEqual(parseHumoMessage("HUMO karta faol", options), {
    direction: "unknown",
    amountUzs: null,
    text: "HUMO karta faol",
  });
});

test("CardXabarBot kirim xabaridan plus qatoridagi summani ajratadi", () => {
  const text = `🟢 Perevod na kartu
➕ 1 000.00 UZS
💳 ***6246
📍 PAYME P2P, UZ
🕓 02.11.26 20:28
💵 1 000.00 UZS`;

  assert.deepEqual(parseHumoMessage(text, options), {
    direction: "credit",
    amountUzs: 1000,
    text,
  });
});

test("CardXabarBot ko‘rinishidagi plus qatorsiz xabarni kirim demaydi", () => {
  assert.equal(
    parseHumoMessage("🔴 Perevod s karty\n➖ 1 000.00 UZS", options)
      .direction,
    "unknown",
  );
});
