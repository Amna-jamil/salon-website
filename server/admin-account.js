import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { resolve } from "node:path";
import { openDatabase } from "./database.js";
import { hashPassword, provisionAdmin } from "./auth.js";

const email = process.argv.slice(2).find((value) => !value.startsWith("--"));
const reset = process.argv.includes("--reset");
if (!email)
  throw new Error(
    "Usage: npm run admin:create -- owner@example.com (or admin:password for an existing admin).",
  );
const db = openDatabase(
  resolve(process.env.DATABASE_PATH || "data/salon.sqlite"),
);
// Password input is hidden on a terminal and never accepted in command-line arguments.
const terminal = Boolean(process.stdin.isTTY);
let muted = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding);
    done();
  },
});
const prompt = createInterface({ input: process.stdin, output, terminal });
try {
  process.stdout.write("Password (12–256 characters, input hidden): ");
  muted = true;
  const password = await prompt.question("");
  muted = false;
  process.stdout.write("\n");
  if (reset) {
    const user = db
      .prepare("SELECT id FROM users WHERE email=? AND role='admin'")
      .get(email.trim().toLowerCase());
    if (!user) throw new Error("No admin exists with this email.");
    const hash = await hashPassword(password);
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
      hash,
      user.id,
    );
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    console.log("Admin password reset. All existing sessions revoked.");
  } else {
    await provisionAdmin(db, email, password);
    console.log("Admin created. Sign in at /admin/login.");
  }
} finally {
  prompt.close();
  db.close();
}
