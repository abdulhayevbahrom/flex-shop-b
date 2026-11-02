import { env } from "../config/env.js";

function containsKeyword(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function parseHumoMessage(
  rawText,
  {
    creditKeywords = env.humoCreditKeywords,
    debitKeywords = env.humoDebitKeywords,
  } = {},
) {
  const text = String(rawText ?? "").trim();
  const normalized = text.toLowerCase().replace(/[’‘`]/g, "'");
  const isCardXabarCredit =
    /(?:^|\n)\s*🟢?\s*perevod\s+na\s+kartu\s*(?:\n|$)/iu.test(text) &&
    /(?:^|\n)\s*➕\s*[\d\s.,]+\s*UZS\b/iu.test(text);
  const isDebit = containsKeyword(normalized, debitKeywords);
  const isCredit = isCardXabarCredit || containsKeyword(normalized, creditKeywords);

  let direction = "unknown";
  if (isCredit && !isDebit) direction = "credit";
  if (isDebit && !isCredit) direction = "debit";

  const candidates = isCardXabarCredit
    ? [...text.matchAll(/(?:^|\n)\s*➕\s*([\d\s.,]+)\s*UZS\b/giu)]
    : [
        ...text.matchAll(
          /(?:\+\s*)?([\d\s.,]+)\s*(?:UZS|SO['’]?M|СУМ)/giu,
        ),
      ];
  const match = candidates[0];
  const numeric = match?.[1]
    ?.replace(/\s/g, "")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(/[.,]\d{1,2}$/, "")
    .replace(/\D/g, "");
  const amountUzs = numeric ? Number(numeric) : null;

  return {
    direction,
    amountUzs: Number.isSafeInteger(amountUzs) ? amountUzs : null,
    text,
  };
}
