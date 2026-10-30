import { TelegramClient } from "teleproto";
import { NewMessage } from "teleproto/events/index.js";
import { StringSession } from "teleproto/sessions/index.js";
import { env } from "../config/env.js";
import { processHumoNotification } from "./humoPayment.service.js";

let client;

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
      const message = event.message;
      if (!message?.message) return;
      const sender = await message.getSender();
      const username = String(sender?.username ?? "").toLowerCase();
      if (username !== env.humoBotUsername) return;

      const chatId = String(message.chatId ?? message.peerId?.userId ?? "unknown");
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
      });
    } catch (error) {
      console.error("HUMO notification processing failed", error);
    }
  }, new NewMessage({}));

  console.log(`HUMO userbot connected; watching @${env.humoBotUsername}`);
}

export async function stopHumoUserbot() {
  if (client) {
    await client.disconnect();
    client = undefined;
  }
}
