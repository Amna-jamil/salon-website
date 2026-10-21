import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { openConfiguredDatabase } from "./database.js";
import { validateConfig, validateRequests } from "../src/admin/store.js";

// Explicit one-time import into an EMPTY cloud database. The source is read-only.
// No credentials, hashes, messages or customer details are printed.
if (!process.env.DATABASE_URL)
  throw new Error("Set the target DATABASE_URL in .env first.");
const source = new DatabaseSync(
  resolve(process.env.DATABASE_PATH || "data/salon.sqlite"),
  { readOnly: true },
);
const tables = [
  "users",
  "superadmins",
  "sessions",
  "guest_sessions",
  "settings",
  "request_state",
  "appointments",
  "conversations",
  "messages",
];
let snapshot;
try {
  source.exec("BEGIN");
  snapshot = Object.fromEntries(
    tables.map((table) => [
      table,
      table === "superadmins" &&
      !source
        .prepare("SELECT name FROM sqlite_master WHERE name='superadmins'")
        .get()
        ? []
        : source
            .prepare(
              `SELECT * FROM ${table}${table === "appointments" ? " ORDER BY rowid" : ""}`,
            )
            .all(),
    ]),
  );
  source.exec("COMMIT");
} finally {
  source.close();
}
if (snapshot.settings.length !== 1)
  throw new Error("Source settings are missing.");
validateConfig(JSON.parse(snapshot.settings[0].data));
validateRequests(snapshot.appointments.map((row) => JSON.parse(row.data)));
const target = await openConfiguredDatabase();
try {
  await target.transaction(async () => {
    for (const table of tables) {
      if (
        (await target.prepare(`SELECT count(*) AS count FROM ${table}`).get())
          .count
      )
        throw new Error(
          `Target ${table} is not empty. Import cancelled; existing data preserved.`,
        );
    }
    for (const table of tables) {
      for (const row of snapshot[table]) {
        const columns = Object.keys(row);
        await target
          .prepare(
            `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
          )
          .run(...Object.values(row));
      }
      if (
        (await target.prepare(`SELECT count(*) AS count FROM ${table}`).get())
          .count !== snapshot[table].length
      )
        throw new Error(`Verification failed for ${table}.`);
    }
    await target.exec(
      "SELECT setval('salon.messages_id_seq', COALESCE((SELECT max(id) FROM messages),1), EXISTS(SELECT 1 FROM messages))",
    );
  });
  console.log(
    "Import verified: settings, accounts, sessions, appointments and portal chat moved to Postgres. Source SQLite preserved.",
  );
} finally {
  await target.close();
}
