import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVercelHandler, vercelOptions } from "./vercel.js";
import { createApp } from "./app.js";
import { openDatabase } from "./database.js";

async function serve(handler, run) {
  const server = createServer(handler).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("Vercel requires a persistent database and an exact HTTPS origin", () => {
  const env = { DATABASE_URL: "postgresql://example.test/salon" };
  assert.throws(() => vercelOptions({}), /DATABASE_URL/);
  for (const APP_ORIGIN of [
    undefined,
    "",
    "invalid",
    "http://salon.test",
    "https://salon.test/",
    "https://salon.test/path",
  ])
    assert.throws(() => vercelOptions({ ...env, APP_ORIGIN }), /APP_ORIGIN/);
  assert.deepEqual(
    vercelOptions({ ...env, APP_ORIGIN: "https://salon.test" }),
    {
      production: true,
      appOrigin: "https://salon.test",
      trustProxy: 1,
    },
  );
});

test("Vercel routes API and admin requests before matching static HTML files", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  const route = (path) =>
    config.routes.find(
      (entry) =>
        entry.handle === "filesystem" ||
        new RegExp(`^${entry.src}$`).test(path),
    );
  for (const path of [
    "/",
    "/index.html",
    "/api/salon",
    "/api/health",
    "/api/auth/login",
    "/admin",
    "/admin/",
    "/admin/login",
    "/admin/index.html",
    "/admin/settings",
  ])
    assert.equal(route(path).dest, "/api/index", path);
  for (const path of [
    "/assets/app.js",
    "/images/hero.jpg",
    "/fonts/dm-sans-400.woff2",
    "/favicon.svg",
  ])
    assert.equal(route(path).handle, "filesystem", path);
});

test("Vercel shares initialization, serves salon data and protects admin pages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "salon-vercel-"));
  const db = openDatabase(":memory:");
  let initializations = 0;
  try {
    await mkdir(join(dir, "admin/login"), { recursive: true });
    for (const file of [
      "index.html",
      "admin/index.html",
      "admin/login/index.html",
    ])
      await writeFile(
        join(dir, file),
        await readFile(new URL(`../${file}`, import.meta.url)),
      );
    const handler = createVercelHandler({
      initialize: async () => {
        initializations++;
        return createApp({
          db,
          dist: dir,
          production: true,
          appOrigin: "https://salon.test",
          trustProxy: 1,
        });
      },
    });
    await serve(handler, async (base) => {
      const responses = await Promise.all([
        fetch(`${base}/api/salon`),
        fetch(`${base}/api/health`),
      ]);
      assert.equal(initializations, 1);
      assert.equal(responses[0].status, 200);
      assert.ok((await responses[0].json()).config.services.length);
      assert.deepEqual(await responses[1].json(), { ok: true });
      const page = await fetch(base);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<title>/);
      const admin = await fetch(`${base}/admin/`, { redirect: "manual" });
      assert.equal(admin.status, 303);
      assert.equal(admin.headers.get("location"), "/admin/login");
      assert.equal((await fetch(`${base}/admin/login`)).status, 200);
      assert.equal((await fetch(`${base}/api/admin/appointments`)).status, 401);
      const forbidden = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: {
          Origin: "https://other.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.test",
          password: "invalid",
        }),
      });
      assert.equal(forbidden.status, 403);
    });
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a failed Vercel cold start returns private, uncached JSON and can recover", async () => {
  let attempts = 0;
  const logs = [];
  const handler = createVercelHandler({
    initialize: async () => {
      if (++attempts === 1) throw new Error("Private connection details");
      return (req, res) => res.end("Recovered");
    },
    logError: (...args) => logs.push(args),
  });
  await serve(handler, async (base) => {
    const failed = await fetch(base);
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("cache-control"), "no-store");
    const body = await failed.json();
    assert.match(body.error, /temporarily unavailable/);
    assert.doesNotMatch(body.error, /Private connection details/);
    assert.equal(logs.length, 1);
    assert.equal(await (await fetch(base)).text(), "Recovered");
    assert.equal(attempts, 2);
  });
});
