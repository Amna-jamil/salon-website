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
export const effectiveRole =
  "CASE WHEN users.role='admin' AND EXISTS(SELECT 1 FROM superadmins WHERE user_id=users.id) THEN 'superadmin' ELSE users.role END";
export const isAdminRole = (role) => ["admin", "superadmin"].includes(role);

export async function promoteSuperadmin(db, email) {
  const user = await db
    .prepare("SELECT id,role FROM users WHERE email=?")
    .get(email.trim().toLowerCase());
  if (!user || user.role !== "admin")
    throw new Error("An existing admin account is required.");
  await db
    .prepare(
      "INSERT INTO superadmins(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING",
    )
    .run(user.id);
}

export async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    throw Object.assign(
      new Error("Use a password between 12 and 256 characters."),
      { status: 400 },
    );
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
  if (typeof email === "string") email = email.trim();
  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254
  )
    throw Object.assign(new Error("Enter a valid admin email address."), {
      status: 400,
    });
  const normalized = email.trim().toLowerCase();
  if (await db.prepare("SELECT id FROM users WHERE email=?").get(normalized))
    throw Object.assign(
      new Error(
        "An account already exists with this email. Use a different email or reset the existing account privately.",
      ),
      { status: 409 },
    );
  const hash = await hashPassword(password);
  const user = {
    id: randomUUID(),
    email: normalized,
    role: "admin",
    createdAt: new Date().toISOString(),
  };
  try {
    await db
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run(user.id, user.email, hash, user.role, user.createdAt);
  } catch (error) {
    if (error.code === "23505" || error.errcode === 2067)
      throw Object.assign(
        new Error("An account already exists with this email."),
        { status: 409 },
      );
    throw error;
  }
  return user;
}

export function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length === 2),
  );
}

export async function adminSession(db, req) {
  const token = cookies(req).salon_session;
  if (!token || !/^[a-f\d]{64}$/.test(token)) return null;
  return (
    (await db
      .prepare(
        `SELECT users.id,users.email,${effectiveRole} AS role,sessions.csrf FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?`,
      )
      .get(tokenHash(token), Date.now())) || null
  );
}
