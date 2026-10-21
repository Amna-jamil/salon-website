import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";

// One SQLite connection needs serialization across async HTTP handlers. A
// transaction keeps its lock while its own queries reuse the same context.
export function sqliteAdapter(raw) {
  const context = new AsyncLocalStorage();
  let tail = Promise.resolve();
  function exclusive(work) {
    if (context.getStore()) return Promise.resolve().then(work);
    const result = tail.then(() => context.run(true, work));
    tail = result.catch(() => {});
    return result;
  }
  return {
    dialect: "sqlite",
    prepare(sql) {
      return Object.fromEntries(
        ["get", "all", "run"].map((method) => [
          method,
          (...args) => exclusive(() => raw.prepare(sql)[method](...args)),
        ]),
      );
    },
    exec: (sql) => exclusive(() => raw.exec(sql)),
    close: () => exclusive(() => raw.close()),
    transaction: (work) =>
      exclusive(async () => {
        raw.exec("BEGIN IMMEDIATE");
        try {
          const result = await work();
          raw.exec("COMMIT");
          return result;
        } catch (error) {
          raw.exec("ROLLBACK");
          throw error;
        }
      }),
  };
}

export function postgresSql(sql) {
  let parameter = 0;
  return sql
    .replace(/\?/g, () => `$${++parameter}`)
    .replace(/ORDER BY rowid/g, "ORDER BY created_order")
    .replace(
      /INSERT INTO appointments VALUES/g,
      "INSERT INTO appointments(id,data) VALUES",
    )
    .replace(/AS (createdAt|updatedAt|lastMessage)\b/g, 'AS "$1"');
}

export async function openPostgres(connectionString, { ca } = {}) {
  const url = new URL(connectionString);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:")
    throw new Error("DATABASE_URL must be a Postgres connection string.");
  // Do not let URL SSL options override certificate verification.
  for (const key of [
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "uselibpqcompat",
  ])
    url.searchParams.delete(key);
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(ca && { ca }) },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    options: "-c search_path=salon,pg_catalog -c statement_timeout=15000",
    types: {
      getTypeParser: (oid, format) =>
        oid === 20 ? Number : pg.types.getTypeParser(oid, format),
    },
  });
  pool.on("error", (error) =>
    console.error(
      "Database idle connection lost:",
      error.code || "connection error",
    ),
  );
  const context = new AsyncLocalStorage();
  const query = (sql, args = []) =>
    (context.getStore() || pool).query(postgresSql(sql), args);
  const db = {
    dialect: "postgres",
    prepare(sql) {
      return {
        get: async (...args) => (await query(sql, args)).rows[0],
        all: async (...args) => (await query(sql, args)).rows,
        run: async (...args) => ({
          changes: (await query(sql, args)).rowCount,
        }),
      };
    },
    exec: (sql) => query(sql),
    close: () => pool.end(),
    async transaction(work) {
      if (context.getStore())
        throw new Error("Nested transactions are not supported.");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await context.run(client, work);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
  try {
    await query("SELECT revision FROM settings WHERE id=1");
    return db;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
