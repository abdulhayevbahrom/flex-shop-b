import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { ensureInitialAdmin } from "../src/services/adminBootstrap.service.js";

try {
  await connectDatabase();
  await ensureInitialAdmin({ resetPassword: true });
  console.log("Admin account is ready: admin");
} finally {
  await disconnectDatabase();
}
