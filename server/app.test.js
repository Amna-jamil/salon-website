import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openDatabase, getSettings } from "./database.js";
import { createApp } from "./app.js";
import {
  provisionAdmin,
  promoteSuperadmin,
  tokenHash,
  newToken,
} from "./auth.js";

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
      reopen: async () => {
        await db.close();
        db = openDatabase(join(dir, "salon.sqlite"));
        return db;
      },
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await db.close();
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

test("only superadmins can list and create normal admins; created accounts can log in without gaining settings access", async () =>
  fixture(async ({ db, client }) => {
    const visitor = client();
    const body = {
      email: "new-admin@example.test",
      password: `New-admin-${randomUUID()}`,
    };
    for (const method of ["GET", "POST"])
      assert.equal(
        (
          await visitor.request("/api/admin/accounts", {
            method,
            ...(method === "POST" && { body }),
          })
        ).status,
        401,
      );
    const owner = client();
    await owner.login();
    assert.equal((await owner.request("/api/admin/accounts")).status, 403);
    assert.equal(
      (await owner.request("/api/admin/accounts", { method: "POST", body }))
        .status,
      403,
    );
    assert.equal((await owner.request("/admin/accounts")).status, 403);
    await promoteSuperadmin(db, "owner@example.test");
    assert.equal((await owner.request("/admin/accounts")).status, 200);
    assert.equal(
      (
        await owner.request("/api/admin/accounts", {
          method: "POST",
          body,
          useCsrf: false,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await owner.request("/api/admin/accounts", {
          method: "POST",
          body,
          origin: "https://other.example",
        })
      ).status,
      403,
    );
    for (const invalid of [
      { ...body, email: "bad-email" },
      { ...body, password: "short" },
      { ...body, role: "superadmin" },
    ])
      assert.equal(
        (
          await owner.request("/api/admin/accounts", {
            method: "POST",
            body: invalid,
          })
        ).status,
        400,
      );
    const created = await owner.request("/api/admin/accounts", {
      method: "POST",
      body: { ...body, email: " NEW-ADMIN@example.test " },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.user.email, body.email);
    assert.equal(created.data.user.role, "admin");
    assert.equal(created.data.user.password_hash, undefined);
    assert.equal(created.data.user.password, undefined);
    const accounts = (await owner.request("/api/admin/accounts")).data.accounts;
    assert.equal(accounts.length, 2);
    assert.equal(
      accounts.find((item) => item.email === "owner@example.test").role,
      "superadmin",
    );
    assert.ok(accounts.every((item) => !item.password_hash && !item.password));
    assert.equal(
      (await owner.request("/api/admin/accounts", { method: "POST", body }))
        .status,
      409,
    );
    const admin = client();
    assert.equal(
      (await admin.request("/api/auth/login", { method: "POST", body })).status,
      200,
    );
    assert.equal((await admin.request("/admin/")).status, 200);
    assert.equal((await admin.request("/api/admin/accounts")).status, 403);
    const settings = (await admin.request("/api/admin/settings")).data;
    settings.config.name = "Not authorized";
    assert.equal(
      (
        await admin.request("/api/admin/settings", {
          method: "PUT",
          body: settings,
        })
      ).status,
      403,
    );
    assert.ok(
      (
        await db
          .prepare("SELECT password_hash FROM users WHERE email=?")
          .get(body.email)
      ).password_hash.startsWith("scrypt:"),
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
    const row = await db.prepare("SELECT password_hash FROM users").get();
    assert.ok(row.password_hash.startsWith("scrypt:"));
    assert.equal(
      (await admin.request("/api/auth/logout", { method: "POST", body: {} }))
        .status,
      200,
    );
    assert.equal((await admin.request("/api/admin/settings")).status, 401);
    const ordinary = client();
    await db
      .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
      .run(
        "ordinary",
        "guest@example.test",
        row.password_hash,
        "customer",
        new Date().toISOString(),
      );
    const token = newToken();
    await db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(tokenHash(token), "ordinary", newToken(), Date.now() + 60000);
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
  fixture(async ({ client, reopen, db }) => {
    await promoteSuperadmin(db, "owner@example.test");
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
    const reopened = await reopen();
    assert.equal(
      (await getSettings(reopened)).config.name,
      "Shared Test Studio",
    );
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

test("admins publish offers to the shared site; public booking discounts are recomputed and paused offers cannot be reused", async () =>
  fixture(async ({ client }) => {
    const admin = client();
    await admin.login();
    const settings = (await admin.request("/api/admin/settings")).data;
    settings.config.offers = [
      {
        id: "server-offer",
        title: "Demo 20% care",
        description: "Test promotion",
        enabled: true,
        type: "Percent",
        value: 20,
        currency: "USD",
        serviceIds: ["cut"],
        branchIds: ["garden"],
        startDate: "",
        endDate: "",
      },
    ];
    assert.equal(
      (
        await admin.request("/api/admin/settings", {
          method: "PUT",
          body: settings,
        })
      ).status,
      200,
    );
    assert.equal(
      (await client().request("/api/salon")).data.config.offers[0].title,
      "Demo 20% care",
    );
    const body = {
      name: "Offer guest",
      phone: "2025550147",
      service: "cut",
      branch: "garden",
      datetime: "2099-02-20T14:30",
      offerId: "server-offer",
      billing: { total: 1 },
      price: 1,
    };
    const created = await client().request("/api/appointments", {
      method: "POST",
      body,
    });
    assert.equal(created.status, 201);
    const inbox = (await admin.request("/api/admin/appointments")).data;
    assert.equal(inbox.requests[0].billing.total, 44);
    assert.equal(inbox.requests[0].billing.discountAmount, 11);
    const paused = (await admin.request("/api/admin/settings")).data;
    paused.config.offers[0].enabled = false;
    assert.equal(
      (
        await admin.request("/api/admin/settings", {
          method: "PUT",
          body: paused,
        })
      ).status,
      200,
    );
    assert.equal(
      (await client().request("/api/appointments", { method: "POST", body }))
        .status,
      400,
    );
    assert.equal(
      (
        await admin.request("/api/admin/appointments", {
          method: "PUT",
          body: inbox,
        })
      ).data.requests[0].billing.total,
      44,
    );
  }));

test("only admins record received payments; customer-supplied paid flags are ignored and payment audit is server-owned", async () =>
  fixture(async ({ db, client, reopen }) => {
    const guest = client();
    const created = await guest.request("/api/appointments", {
      method: "POST",
      body: {
        name: "Payment verification guest",
        phone: "2025550147",
        service: "cut",
        branch: "garden",
        datetime: "2099-02-20T14:30",
        payment: {
          method: "Online",
          status: "Paid",
          amount: 9999,
          reference: "Fake customer claim",
        },
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.payment, undefined);
    const admin = client();
    await admin.login();
    let inbox = (await admin.request("/api/admin/appointments")).data;
    assert.equal(inbox.requests[0].payment.status, "Pending");
    assert.equal(inbox.requests[0].payment.amount, 0);
    const stale = structuredClone(inbox);
    inbox.requests[0].payment = {
      ...inbox.requests[0].payment,
      method: "Online",
      status: "Paid",
      amount: 55,
      reference: "BANK-TEST-123",
      updatedBy: "forged@example.test",
      updatedAt: "2000-01-01T00:00:00.000Z",
    };
    assert.equal(
      (
        await guest.request("/api/admin/appointments", {
          method: "PUT",
          body: inbox,
        })
      ).status,
      401,
    );
    const saved = await admin.request("/api/admin/appointments", {
      method: "PUT",
      body: inbox,
    });
    assert.equal(saved.status, 200);
    const payment = saved.data.requests[0].payment;
    assert.equal(payment.updatedBy, "owner@example.test");
    assert.notEqual(payment.updatedAt, "2000-01-01T00:00:00.000Z");
    assert.equal(payment.status, "Paid");
    assert.equal(payment.currency, (await getSettings(db)).config.currency);
    assert.equal(
      (
        await admin.request("/api/admin/appointments", {
          method: "PUT",
          body: stale,
        })
      ).status,
      409,
    );
    inbox = saved.data;
    delete inbox.requests[0].payment;
    const oldClientSave = await admin.request("/api/admin/appointments", {
      method: "PUT",
      body: inbox,
    });
    assert.equal(oldClientSave.status, 200);
    assert.deepEqual(oldClientSave.data.requests[0].payment, payment);
    const reopened = await reopen();
    const persisted = JSON.parse(
      (
        await reopened
          .prepare("SELECT data FROM appointments WHERE id=?")
          .get(created.data.id)
      ).data,
    );
    assert.deepEqual(persisted.payment, payment);
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
      (await db.prepare("SELECT count(*) AS count FROM messages").get()).count,
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
    await db.exec("UPDATE sessions SET expires_at=0");
    assert.equal((await admin.request("/api/admin/settings")).status, 401);
    await admin.login();
    await db.exec("UPDATE users SET role='customer'");
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

test("regular admins manage services and addresses but cannot change website settings or grant themselves superadmin", async () =>
  fixture(async ({ client, db }) => {
    const admin = client();
    await admin.login();
    assert.equal((await admin.request("/api/admin/system")).status, 403);
    assert.equal((await admin.request("/admin/settings")).status, 403);
    for (const change of [
      (config) => {
        config.name = "Unauthorized branding";
      },
      (config) => {
        config.contact.whatsappNumber = "442079460000";
      },
      (config) => {
        config.seo.title = "Unauthorized SEO";
      },
      (config) => {
        config.demoMode = false;
      },
      (config) => {
        config.hero.title[0] = "Unauthorized homepage";
      },
    ]) {
      const body = (await admin.request("/api/admin/settings")).data;
      change(body.config);
      assert.equal(
        (await admin.request("/api/admin/settings", { method: "PUT", body }))
          .status,
        403,
      );
    }
    const body = (await admin.request("/api/admin/settings")).data;
    body.config.services[0].items[0].price = 92;
    body.config.branches[0].address = "Demo verification address";
    assert.equal(
      (await admin.request("/api/admin/settings", { method: "PUT", body }))
        .status,
      200,
    );
    assert.equal(
      (await client().request("/api/salon")).data.config.branches[0].address,
      "Demo verification address",
    );
    assert.equal(
      (
        await admin.request("/api/auth/promote", {
          method: "POST",
          body: { role: "superadmin" },
        })
      ).status,
      404,
    );
    assert.equal(
      (await db.prepare("SELECT count(*) AS count FROM superadmins").get())
        .count,
      0,
    );
  }));

test("private promotion preserves the password and grants settings access only while the admin role remains authorized", async () =>
  fixture(async ({ client, db }) => {
    const before = (await db.prepare("SELECT password_hash FROM users").get())
      .password_hash;
    await promoteSuperadmin(db, "owner@example.test");
    const admin = client();
    const login = await admin.login();
    assert.equal(login.data.user.role, "superadmin");
    assert.equal((await admin.request("/admin/settings")).status, 200);
    assert.equal(
      (await admin.request("/api/admin/system")).data.database,
      "Local SQLite",
    );
    const body = (await admin.request("/api/admin/settings")).data;
    body.config.contact.whatsappNumber = "442079460123";
    assert.equal(
      (await admin.request("/api/admin/settings", { method: "PUT", body }))
        .status,
      200,
    );
    assert.equal(
      (await client().request("/api/salon")).data.config.contact.whatsappNumber,
      "442079460123",
    );
    assert.equal(
      (await db.prepare("SELECT password_hash FROM users").get()).password_hash,
      before,
    );
    await db.exec("UPDATE users SET role='customer'");
    assert.equal((await admin.request("/api/admin/system")).status, 403);
    assert.equal((await admin.request("/admin/")).status, 403);
  }));
