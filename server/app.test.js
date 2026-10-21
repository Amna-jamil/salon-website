import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openDatabase, getSettings } from "./database.js";
import { createApp } from "./app.js";
import { provisionAdmin, tokenHash, newToken } from "./auth.js";

async function fixture(run, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "salon-integration-"));
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
  let db = openDatabase(join(dir, "salon.sqlite"));
  const password = `Test-only-${randomUUID()}`;
  await provisionAdmin(db, "owner@example.test", password);
  const app = await createApp({ db, dist: dir, limits: false, ...options });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    const jar = new Map();
    let csrf = "";
    return {
      jar,
      async request(
        path,
        {
          method = "GET",
          body,
          origin = options.appOrigin || base,
          useCsrf = true,
        } = {},
      ) {
        const response = await fetch(base + path, {
          method,
          redirect: "manual",
          headers: {
            ...(body !== undefined && {
              "Content-Type": "application/json",
              Origin: origin,
            }),
            ...(useCsrf && csrf && { "X-CSRF-Token": csrf }),
            Cookie: [...jar]
              .map(([name, value]) => `${name}=${value}`)
              .join("; "),
          },
          ...(body !== undefined && { body: JSON.stringify(body) }),
        });
        for (const cookie of response.headers.getSetCookie()) {
          const [name, value] = cookie.split(";")[0].split("=");
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
        const raw = await response.text();
        const data = response.headers.get("content-type")?.includes("json")
          ? JSON.parse(raw)
          : null;
        if (data?.csrf) csrf = data.csrf;
        return {
          status: response.status,
          headers: response.headers,
          data,
          html: raw,
        };
      },
      async login() {
        return this.request("/api/auth/login", {
          method: "POST",
          body: { email: "owner@example.test", password },
        });
      },
    };
  }
  try {
    await run({
      db,
      client,
      base,
      password,
      dir,
      reopen: () => {
        db.close();
        db = openDatabase(join(dir, "salon.sqlite"));
        return db;
      },
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("public website opens by default and every admin page redirects anonymous visitors", async () =>
  fixture(async ({ client }) => {
    const visitor = client();
    assert.equal((await visitor.request("/")).status, 200);
    assert.ok(
      (await visitor.request("/admin/login")).html.includes("Admin Login"),
    );
    for (const path of [
      "/admin",
      "/admin/",
      "/admin/index.html",
      "/admin/settings",
      "/admin/conversations",
    ]) {
      const response = await visitor.request(path);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), "/admin/login");
    }
    for (const path of [
      "/api/auth/session",
      "/api/admin/settings",
      "/api/admin/appointments",
      "/api/admin/conversations",
    ])
      assert.equal((await visitor.request(path)).status, 401);
    assert.equal(
      (await visitor.request("/api/auth/signup", { method: "POST", body: {} }))
        .status,
      404,
    );
  }));

test("admin login uses private cookies, rejects wrong passwords, supports logout and role checks", async () =>
  fixture(async ({ db, client }) => {
    const admin = client();
    assert.equal(
      (
        await admin.request("/api/auth/login", {
          method: "POST",
          body: { email: "owner@example.test", password: "incorrect" },
        })
      ).status,
      401,
    );
    const login = await admin.login();
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /HttpOnly/);
    assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);
    assert.equal((await admin.request("/admin/")).status, 200);
    assert.equal(
      (await admin.request("/api/auth/session")).data.user.role,
      "admin",
    );
    const row = db.prepare("SELECT password_hash FROM users").get();
    assert.ok(row.password_hash.startsWith("scrypt:"));
    assert.equal(
      (await admin.request("/api/auth/logout", { method: "POST", body: {} }))
        .status,
      200,
    );
    assert.equal((await admin.request("/api/admin/settings")).status, 401);
    const ordinary = client();
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
      "ordinary",
      "guest@example.test",
      row.password_hash,
      "customer",
      new Date().toISOString(),
    );
    const token = newToken();
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
      tokenHash(token),
      "ordinary",
      newToken(),
      Date.now() + 60000,
    );
    ordinary.jar.set("salon_session", token);
    assert.equal((await ordinary.request("/admin/")).status, 403);
    assert.equal((await ordinary.request("/api/admin/settings")).status, 403);
  }));

test("admin writes require same-origin requests and a session CSRF token", async () =>
  fixture(async ({ client }) => {
    const admin = client();
    await admin.login();
    const { config, revision } = (await admin.request("/api/admin/settings"))
      .data;
    for (const options of [
      { useCsrf: false },
      { origin: "https://other.example" },
    ]) {
      assert.equal(
        (
          await admin.request("/api/admin/settings", {
            method: "PUT",
            body: { config, revision },
            ...options,
          })
        ).status,
        403,
      );
    }
    assert.equal(
      (await admin.request("/api/admin/settings")).data.revision,
      revision,
    );
  }));

test("admin data and full branch addresses publish to a separate public client and survive database reopening", async () =>
  fixture(async ({ client, reopen }) => {
    const admin = client();
    await admin.login();
    const { config, revision } = (await admin.request("/api/admin/settings"))
      .data;
    config.name = "Shared Test Studio";
    config.services[0].items[0].price = 82.5;
    config.contact.whatsappNumber = "442079460123";
    config.gallery[0].image = "/images/nails.jpg";
    config.branches[0].address = "Fictional Studio 12, Garden Road, Test City";
    config.seo.title = "Shared Test Studio - Beauty";
    const response = await admin.request("/api/admin/settings", {
      method: "PUT",
      body: { config, revision },
    });
    assert.equal(response.status, 200);
    const publicConfig = (await client().request("/api/salon")).data.config;
    assert.equal(publicConfig.name, config.name);
    assert.equal(publicConfig.services[0].items[0].price, 82.5);
    assert.equal(publicConfig.branches[0].address, config.branches[0].address);
    assert.ok((await client().request("/")).html.includes(config.seo.title));
    const reopened = reopen();
    assert.equal(getSettings(reopened).config.name, "Shared Test Studio");
  }));

test("conflicting updates and malformed data leave saved settings intact", async () =>
  fixture(async ({ client }) => {
    const admin = client();
    await admin.login();
    const original = (await admin.request("/api/admin/settings")).data;
    assert.equal(
      (
        await admin.request("/api/admin/settings", {
          method: "PUT",
          body: original,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await admin.request("/api/admin/settings", {
          method: "PUT",
          body: original,
        })
      ).status,
      409,
    );
    const current = (await admin.request("/api/admin/settings")).data;
    current.config.branches = [];
    assert.equal(
      (
        await admin.request("/api/admin/settings", {
          method: "PUT",
          body: current,
        })
      ).status,
      400,
    );
    assert.ok(
      (await admin.request("/api/admin/settings")).data.config.branches.length,
    );
  }));

test("public appointment requests reach the authorized inbox without exposing guest details publicly", async () =>
  fixture(async ({ client }) => {
    const visitor = client();
    const response = await visitor.request("/api/appointments", {
      method: "POST",
      body: {
        name: "Demo integration guest",
        phone: "2025550147",
        service: "cut",
        branch: "garden",
        datetime: "2099-02-20T14:30",
      },
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.status, "Pending");
    assert.equal(response.data.name, undefined);
    const admin = client();
    await admin.login();
    const inbox = (await admin.request("/api/admin/appointments")).data;
    assert.equal(inbox.requests[0].name, "Demo integration guest");
    inbox.requests[0].status = "Confirmed";
    assert.equal(
      (
        await admin.request("/api/admin/appointments", {
          method: "PUT",
          body: inbox,
        })
      ).status,
      200,
    );
    assert.equal(
      (await visitor.request("/api/admin/appointments")).status,
      401,
    );
    assert.equal(
      (
        await visitor.request("/api/appointments", {
          method: "POST",
          body: { name: 44 },
        })
      ).status,
      400,
    );
  }));

test("portal messages travel customer-to-admin and back while remaining private to the originating guest", async () =>
  fixture(async ({ db, client }) => {
    const guest = client();
    const stranger = client();
    const created = await guest.request("/api/chat/conversations", {
      method: "POST",
      body: {
        name: "Demo chat guest",
        phone: "2025550147",
        message: "Can I ask about a cut?",
      },
    });
    assert.equal(created.status, 201);
    assert.match(created.headers.get("set-cookie"), /HttpOnly/);
    const id = created.data.conversation.id;
    assert.equal(
      (await stranger.request("/api/chat/conversation")).data.conversation,
      null,
    );
    assert.equal(
      (
        await stranger.request(`/api/chat/conversations/${id}/messages`, {
          method: "POST",
          body: { message: "Unauthorized reply" },
        })
      ).status,
      404,
    );
    const admin = client();
    await admin.login();
    const inbox = await admin.request("/api/admin/conversations");
    assert.equal(inbox.data.whatsappSync, false);
    assert.equal(inbox.data.conversations[0].unread, 1);
    assert.equal(
      (await admin.request(`/api/admin/conversations/${id}`)).data.conversation
        .name,
      "Demo chat guest",
    );
    assert.equal(
      (
        await admin.request(`/api/admin/conversations/${id}/messages`, {
          method: "POST",
          body: { message: "Of course. What would you like to know?" },
        })
      ).status,
      201,
    );
    const reply = (
      await guest.request("/api/chat/conversation")
    ).data.conversation.messages.at(-1);
    assert.equal(reply.sender, "admin");
    assert.ok(reply.body.includes("Of course"));
    assert.equal(
      (
        await guest.request(`/api/chat/conversations/${id}/messages`, {
          method: "POST",
          body: { message: "Thank you." },
        })
      ).status,
      201,
    );
    assert.equal(
      db.prepare("SELECT count(*) AS count FROM messages").get().count,
      3,
    );
    assert.equal(
      (await stranger.request("/api/admin/conversations")).status,
      401,
    );
  }));

test("expired sessions and revoked admin roles cannot keep dashboard access", async () =>
  fixture(async ({ db, client }) => {
    const admin = client();
    await admin.login();
    db.exec("UPDATE sessions SET expires_at=0");
    assert.equal((await admin.request("/api/admin/settings")).status, 401);
    await admin.login();
    db.exec("UPDATE users SET role='customer'");
    assert.equal((await admin.request("/api/admin/settings")).status, 403);
  }));

test("production sessions use Secure cookies and restrictive response headers", async () =>
  fixture(
    async ({ client }) => {
      const admin = client();
      const response = await admin.login();
      assert.equal(response.status, 200);
      assert.match(response.headers.get("set-cookie"), /Secure/);
      assert.match(
        response.headers.get("content-security-policy"),
        /script-src 'self'/,
      );
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    },
    { production: true, appOrigin: "https://salon.example.test" },
  ));
