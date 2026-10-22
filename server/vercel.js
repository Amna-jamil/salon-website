import { createApp } from "./app.js";
import { openConfiguredDatabase } from "./database.js";

export function vercelOptions(env) {
  if (!env.DATABASE_URL)
    throw new Error(
      "Set DATABASE_URL in Vercel. SQLite is not persistent there.",
    );
  if (!URL.canParse(env.APP_ORIGIN))
    throw new Error(
      "Set APP_ORIGIN to the public HTTPS origin without a trailing slash.",
    );
  const origin = new URL(env.APP_ORIGIN);
  if (origin.protocol !== "https:" || origin.origin !== env.APP_ORIGIN)
    throw new Error(
      "Set APP_ORIGIN to the public HTTPS origin without a trailing slash.",
    );
  return { production: true, appOrigin: origin.origin, trustProxy: 1 };
}

async function initializeApp() {
  const options = vercelOptions(process.env);
  const db = await openConfiguredDatabase();
  try {
    return await createApp({ db, ...options });
  } catch (error) {
    await db.close();
    throw error;
  }
}

export function createVercelHandler({
  initialize = initializeApp,
  logError = console.error,
} = {}) {
  // Concurrent cold-start requests share one database pool and Express app.
  let application;
  return async function handler(req, res) {
    let app;
    try {
      application ||= Promise.resolve()
        .then(initialize)
        .catch((error) => {
          application = undefined;
          throw error;
        });
      app = await application;
    } catch (error) {
      logError(
        "Salon backend initialization failed:",
        error.code || error.message,
      );
      res.writeHead(503, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify({
          error:
            "The salon server is temporarily unavailable. Please try again shortly.",
        }),
      );
      return;
    }
    // Keep the function active until Express finishes its asynchronous handlers.
    await new Promise((resolve) => {
      res.once("finish", resolve);
      res.once("close", resolve);
      app(req, res);
    });
  };
}
