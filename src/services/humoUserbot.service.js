import { TelegramClient } from "teleproto";
import { NewMessage } from "teleproto/events/index.js";
import { StringSession } from "teleproto/sessions/index.js";
import { env } from "../config/env.js";
import { processHumoNotification } from "./humoPayment.service.js";

let client;

async function processMessage(message, fallbackChatId) {
  if (!message?.message) return;
  const sender = await message.getSender().catch(() => null);
  const username = String(sender?.username ?? (fallbackChatId ? env.humoBotUsername : "")).toLowerCase();
  if (username !== env.humoBotUsername) return;
  const chatId = String(message.chatId ?? message.peerId?.userId ?? fallbackChatId ?? "unknown");
  const result = await processHumoNotification({
    telegramMessageId: `${chatId}:${message.id}`,
    telegramChatId: chatId,
    senderUsername: username,
    text: message.message,
    telegramDate: message.date ? new Date(Number(message.date) * 1000) : new Date(),
  });
  console.log("HUMO notification processed", {
    telegramMessageId: `${chatId}:${message.id}`,
    matched: result.matched ?? false,
    ignored: result.ignored ?? false,
    unmatched: result.unmatched ?? false,
    duplicate: result.duplicate ?? false,
  });
}

export async function startHumoUserbot() {
  if (!env.humoUserbotEnabled) {
    console.log("HUMO userbot is disabled");
    return;
  }

  client = new TelegramClient(
    new StringSession(env.telegramUserSession),
    env.telegramApiId,
    env.telegramApiHash,
    { connectionRetries: 5 },
  );
  await client.connect();
  if (!(await client.isUserAuthorized())) {
    throw new Error("TELEGRAM_USER_SESSION is not authorized; run npm run telegram:login");
  }

  client.addEventHandler(async (event) => {
    try {
      await processMessage(event.message);
    } catch (error) {
      console.error("HUMO notification processing failed", error);
    }
  }, new NewMessage({}));

  const humoEntity = await client.getEntity(`@${env.humoBotUsername}`);
  const recentMessages = await client.getMessages(humoEntity, { limit: 100 });
  for (const message of [...recentMessages].reverse()) {
    if (Number(message.date) * 1000 < Date.now() - 24 * 60 * 60 * 1000) continue;
    await processMessage(message, humoEntity.id);
  }

  console.log(`HUMO userbot connected; watching @${env.humoBotUsername}; synced ${recentMessages.length} recent messages`);
}

export async function stopHumoUserbot() {
  if (client) {
    await client.disconnect();
    client = undefined;
  }
}
