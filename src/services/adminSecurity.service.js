import crypto from "node:crypto";
import { SystemSetting } from "../models/SystemSetting.js";

const JWT_SECRET_KEY = "admin.jwt_secret";
let cachedJwtSecret = "";

export async function ensureAdminJwtSecret() {
  if (cachedJwtSecret) return cachedJwtSecret;
  const generated = crypto.randomBytes(64).toString("hex");
  const setting = await SystemSetting.findOneAndUpdate(
    { key: JWT_SECRET_KEY },
    { $setOnInsert: { value: generated } },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  );
  cachedJwtSecret = String(setting.value);
  return cachedJwtSecret;
}

export function getAdminJwtSecret() {
  return ensureAdminJwtSecret();
}
