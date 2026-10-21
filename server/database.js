import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { salon } from "../src/salon.config.js";
import { sqliteAdapter, openPostgres } from "./connection.js";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export function openDatabase(filename) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  if (filename !== ":memory:") chmodSync(filename, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','customer')),created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS guest_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS request_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS appointments(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,guest_hash TEXT NOT NULL REFERENCES guest_sessions(token_hash),name TEXT NOT NULL,phone TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,admin_read_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,sender TEXT NOT NULL CHECK(sender IN ('customer','admin')),body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,id);
    CREATE INDEX IF NOT EXISTS conversations_guest ON conversations(guest_hash);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);`);
  db.exec(
    "CREATE TABLE IF NOT EXISTS superadmins(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE)",
  );
  db.prepare("INSERT OR IGNORE INTO settings(id,data) VALUES(1,?)").run(
    JSON.stringify(salon),
  );
  db.prepare("INSERT OR IGNORE INTO request_state(id) VALUES(1)").run();
  return sqliteAdapter(db);
}

export async function openConfiguredDatabase() {
  if (process.env.DATABASE_URL) {
    const ca = process.env.DATABASE_CA_PATH
      ? await readFile(resolve(process.env.DATABASE_CA_PATH), "utf8")
      : undefined;
    return openPostgres(process.env.DATABASE_URL, { ca });
  }
  if (process.env.SUPABASE_PROJECT_REF)
    throw new Error(
      "Supabase is selected but DATABASE_URL is missing. Local storage fallback is disabled.",
    );
  return openDatabase(
    resolve(process.env.DATABASE_PATH || "data/salon.sqlite"),
  );
}

export function transaction(db, work) {
  return db.transaction(work);
}

export async function getSettings(db) {
  const row = await db
    .prepare("SELECT data,revision FROM settings WHERE id=1")
    .get();
  return { config: JSON.parse(row.data), revision: row.revision };
}

export async function getAppointments(db) {
  return {
    requests: (
      await db.prepare("SELECT data FROM appointments ORDER BY rowid").all()
    ).map((row) => JSON.parse(row.data)),
    revision: (
      await db.prepare("SELECT revision FROM request_state WHERE id=1").get()
    ).revision,
  };
}
