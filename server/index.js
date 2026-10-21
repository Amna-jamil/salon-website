import { openConfiguredDatabase } from "./database.js";
import { createApp } from "./app.js";

const production =
  process.env.NODE_ENV === "production" ||
  process.argv.includes("--production");
const appOrigin = process.env.APP_ORIGIN || "";
if (production && (!appOrigin || !appOrigin.startsWith("https://")))
  throw new Error(
    "Set APP_ORIGIN to the public HTTPS origin before starting production.",
  );
const db = await openConfiguredDatabase();
const vite =
  production || process.argv.includes("--preview")
    ? null
    : await (
        await import("vite")
      ).createServer({ server: { middlewareMode: true }, appType: "custom" });
const app = await createApp({
  db,
  production,
  appOrigin,
  vite,
  trustProxy: process.env.TRUST_PROXY === "1" ? 1 : false,
});
const port = Number(process.env.PORT || 5173);
const server = app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `Salon application: http://127.0.0.1:${port}\nPublic: /  Admin login: /admin/login  Admin: /admin/`,
  ),
);
async function shutdown() {
  server.closeAllConnections();
  server.close();
  await vite?.close();
  await db.close();
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
