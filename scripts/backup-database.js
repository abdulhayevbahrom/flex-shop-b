import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { setPriority } from "node:os";
import path from "node:path";

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("MONGO_URI is not configured");
  process.exit(1);
}

const backupDir = path.resolve(process.env.BACKUP_DIR || "./backups");
await mkdir(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const archivePath = path.join(backupDir, `flex-shop-${timestamp}.archive.gz`);
const child = spawn("mongodump", [
  `--uri=${mongoUri}`,
  `--archive=${archivePath}`,
  "--gzip",
  "--numParallelCollections=1",
], { stdio: "inherit" });

if (child.pid) {
  try {
    setPriority(child.pid, 10);
  } catch (error) {
    console.warn(`Backup CPU prioritetini pasaytirib bo‘lmadi: ${error.message}`);
  }
}

child.on("error", (error) => {
  if (error.code === "ENOENT") {
    console.error("mongodump topilmadi. Serverga MongoDB Database Tools o‘rnating.");
  } else {
    console.error("Database backup ishga tushmadi", error);
  }
  process.exit(1);
});

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`Database backup yaratildi: ${archivePath}`);
  } else {
    console.error(`mongodump xato bilan yakunlandi (code ${code})`);
  }
  process.exit(code ?? 1);
});
