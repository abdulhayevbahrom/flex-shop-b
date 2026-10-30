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
