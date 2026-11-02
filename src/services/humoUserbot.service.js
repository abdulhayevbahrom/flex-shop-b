import { TelegramClient } from "teleproto";
import { NewMessage } from "teleproto/events/index.js";
import { StringSession } from "teleproto/sessions/index.js";
import { env } from "../config/env.js";
import { processHumoNotification } from "./humoPayment.service.js";

let client;

async function processMessage(message, fallbackChatId) {
  if (!message?.message) return;
  const sender = await message.getSender().catch(() => null);
  const fallbackUsername =
    typeof fallbackChatId === "object" ? fallbackChatId.username : "";
  const fallbackId =
    typeof fallbackChatId === "object" ? fallbackChatId.id : fallbackChatId;
  const username = String(sender?.username ?? fallbackUsername).toLowerCase();
  if (!env.paymentBotUsernames.includes(username)) return;
  const chatId = String(
    message.chatId ?? message.peerId?.userId ?? fallbackId ?? "unknown",
  );
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

  let syncedMessages = 0;
  const watchedBots = [];
  for (const username of env.paymentBotUsernames) {
    const entity = await client.getEntity(`@${username}`);
    watchedBots.push(`@${username}`);
    const recentMessages = await client.getMessages(entity, { limit: 100 });
    syncedMessages += recentMessages.length;
    for (const message of [...recentMessages].reverse()) {
      if (Number(message.date) * 1000 < Date.now() - 24 * 60 * 60 * 1000) {
        continue;
      }
      await processMessage(message, { id: entity.id, username });
    }
  }

  console.log(
    `Payment userbot connected; watching ${watchedBots.join(", ")}; synced ${syncedMessages} recent messages`,
  );
}

export async function stopHumoUserbot() {
  if (client) {
    await client.disconnect();
    client = undefined;
  }
}
