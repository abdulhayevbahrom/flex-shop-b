import bcrypt from "bcryptjs";
import { Admin } from "../models/Admin.js";
import { ensureAdminJwtSecret } from "./adminSecurity.service.js";

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin123";

export async function ensureInitialAdmin({ resetPassword = false } = {}) {
  await ensureAdminJwtSecret();
  const username = DEFAULT_ADMIN_USERNAME;
  const existing = await Admin.findOne({ username });
  if (existing) {
    if (resetPassword || !existing.isActive) {
      existing.passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
      existing.isActive = true;
      await existing.save();
      console.log(`Admin credentials saved in database: ${username}`);
    }
    return;
  }
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 12);
  await Admin.create({ username, passwordHash });
  console.log(`Initial admin created: ${username}`);
}
