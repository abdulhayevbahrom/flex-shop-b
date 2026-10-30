import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
if (!apiId || !apiHash) {
  console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first.");
  process.exit(1);
}

const terminal = readline.createInterface({ input, output });
const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 5,
});

try {
  await client.start({
    phoneNumber: () => terminal.question("Telegram phone number (+998...): "),
    phoneCode: () => terminal.question("Telegram login code: "),
    password: () => terminal.question("Telegram 2FA password (if enabled): "),
    onError: (error) => console.error("Telegram login error:", error.message),
  });
  console.log("\nAdd this value to backend/.env:\n");
  console.log(`TELEGRAM_USER_SESSION=${client.session.save()}`);
  console.log("\nTreat this session as a password. Never commit or send it to anyone.");
} finally {
  await client.disconnect();
  terminal.close();
}
