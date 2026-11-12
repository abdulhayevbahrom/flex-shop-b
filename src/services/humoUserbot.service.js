import { TelegramClient } from "teleproto";
import { NewMessage } from "teleproto/events/index.js";
import { StringSession } from "teleproto/sessions/index.js";
import { env } from "../config/env.js";
import { PaymentNotification } from "../models/PaymentNotification.js";
import { processHumoNotification } from "./humoPayment.service.js";

const historyIntervalMs = 15_000;
const historyLookbackMs = 15 * 60_000;
const startupLookbackMs = 24 * 60 * 60_000;
let client;
let historyTimer;
let historyRecovery;

function messageDate(message) {
  if (message.date instanceof Date) return message.date;
  const seconds = Number(message.date);
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

export async function startHumoUserbot() {
  if (!env.humoUserbotEnabled || client) return;

  const telegram = new TelegramClient(
    new StringSession(env.telegramUserSession),
    env.telegramApiId,
    env.telegramApiHash,
    { connectionRetries: 5 },
  );
  client = telegram;
  const sources = new Map();
  const processing = new Set();

  async function processMessage(message, source) {
    if (!message?.message || message.out || message.fwdFrom) return;
    const chatId = String(message.chatId ?? message.peerId?.userId ?? source?.id ?? "");
    const bot = sources.get(chatId);
    const date = messageDate(message);
    if (!bot || !message.id || !date || !Number.isFinite(date.getTime())) return;

    const key = `${chatId}:${message.id}`;
    if (processing.has(key)) return;
    processing.add(key);
    try {
      await processHumoNotification({
        telegramMessageId: key,
        telegramChatId: chatId,
        senderUsername: bot.username,
        text: message.message,
        telegramDate: date,
      });
    } finally {
      processing.delete(key);
    }
  }

  async function recoverHistory(lookbackMs) {
    for (const username of env.paymentBotUsernames) {
      if (client !== telegram || !telegram.connected) return;
      try {
        let source = [...sources.values()].find((item) => item.username === username);
        if (!source) {
          const entity = await telegram.getEntity(`@${username}`);
          if (!entity.bot || !entity.id) throw new Error("Configured payment account is not a bot");
          source = { id: String(entity.id), username, entity };
          sources.set(source.id, source);
        }
        const recent = await telegram.getMessages(source.entity, { limit: 100 });
        const cutoff = Date.now() - lookbackMs;
        const messages = [...recent].reverse().filter((message) =>
          message?.message && !message.out && !message.fwdFrom &&
          messageDate(message)?.getTime() >= cutoff,
        );
        const keys = messages.map((message) => `${source.id}:${message.id}`);
        if (!keys.length) continue;

        const existing = await PaymentNotification.find({
          telegramMessageId: { $in: keys },
          status: { $in: ["matched", "ignored", "unmatched", "error"] },
        }).distinct("telegramMessageId");
        const known = new Set(existing);
        for (const message of messages) {
          if (client !== telegram) return;
          if (known.has(`${source.id}:${message.id}`)) continue;
          try {
            await processMessage(message, source);
          } catch (error) {
            console.error("Payment history message failed", { username, id: message.id, error: error.message });
          }
        }
      } catch (error) {
        console.error("Payment bot history recovery failed", { username, error: error.message });
      }
    }
  }

  function scheduleRecovery(lookbackMs) {
    if (historyRecovery) return historyRecovery;
    historyRecovery = recoverHistory(lookbackMs).finally(() => {
      historyRecovery = undefined;
    });
    return historyRecovery;
  }

  try {
    await telegram.connect();
    if (!(await telegram.isUserAuthorized())) {
      throw new Error("TELEGRAM_USER_SESSION is not authorized; run npm run telegram:login");
    }

    telegram.addEventHandler(async ({ message }) => {
      if (client !== telegram) return;
      try {
        await processMessage(message);
      } catch (error) {
        console.error("Live payment notification failed", error);
      }
    }, new NewMessage({}));

    void scheduleRecovery(startupLookbackMs);
    historyTimer = setInterval(() => void scheduleRecovery(historyLookbackMs), historyIntervalMs);
    historyTimer.unref();
  } catch (error) {
    client = undefined;
    await telegram.disconnect().catch(() => {});
    throw error;
  }
}

export async function stopHumoUserbot() {
  clearInterval(historyTimer);
  historyTimer = undefined;
  const telegram = client;
  client = undefined;
  if (telegram) await telegram.disconnect();
  await historyRecovery;
}
