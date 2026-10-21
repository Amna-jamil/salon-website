import {
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
export const tokenHash = (token) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");

export async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    throw new Error("Use a password between 12 and 256 characters.");
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== "string" || password.length > 256) return false;
  const [, salt, hash] = stored.split(":");
  const candidate = await derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

export async function provisionAdmin(db, email, password) {
  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254
  )
    throw new Error("Enter a valid admin email address.");
  const normalized = email.trim().toLowerCase();
  if (db.prepare("SELECT id FROM users WHERE email=?").get(normalized))
    throw new Error(
      "This account already exists. Use admin:password to reset an existing admin password.",
    );
  const hash = await hashPassword(password);
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
    randomUUID(),
    normalized,
    hash,
    "admin",
    new Date().toISOString(),
  );
}

export function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length === 2),
  );
}

export function adminSession(db, req) {
  const token = cookies(req).salon_session;
  if (!token || !/^[a-f\d]{64}$/.test(token)) return null;
  return (
    db
      .prepare(
        "SELECT users.id,users.email,users.role,sessions.csrf FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?",
      )
      .get(tokenHash(token), Date.now()) || null
  );
}
