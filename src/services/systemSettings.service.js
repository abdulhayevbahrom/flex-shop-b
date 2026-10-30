import { SystemSetting } from "../models/SystemSetting.js";

let botStateCache = { enabled: true, expiresAt: 0 };

export async function getBotEnabled() {
  if (botStateCache.expiresAt > Date.now()) return botStateCache.enabled;
  const setting = await SystemSetting.findOne({ key: "botEnabled" }).lean();
  botStateCache = { enabled: setting?.value !== false, expiresAt: Date.now() + 5000 };
  return botStateCache.enabled;
}

export async function setBotEnabled(enabled, adminId) {
  const setting = await SystemSetting.findOneAndUpdate(
    { key: "botEnabled" },
    { $set: { value: Boolean(enabled), updatedBy: adminId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  botStateCache = { enabled: Boolean(enabled), expiresAt: Date.now() + 5000 };
  return setting.value;
}
