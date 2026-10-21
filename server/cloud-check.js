import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openConfiguredDatabase, getSettings } from "./database.js";
import { createApp } from "./app.js";
import { provisionAdmin, promoteSuperadmin, tokenHash } from "./auth.js";
import { calculateBill, salonDay } from "../src/pricing.js";
import { monthlyReport } from "../src/admin/reporting.js";

// Explicit integration check against the configured cloud database. Temporary
// records are removed in finally; business settings are saved without changes.
if (!process.env.DATABASE_URL)
  throw new Error("Configure DATABASE_URL before checking cloud integration.");
const db = await openConfiguredDatabase();
const email = `check-${randomUUID()}@example.invalid`;
const password = randomUUID() + randomUUID();
let server, appointmentId, guestHash, userId, createdAdminId;
try {
  await provisionAdmin(db, email, password);
  userId = (await db.prepare("SELECT id FROM users WHERE email=?").get(email))
    .id;
  const app = await createApp({ db, limits: false });
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    const jar = new Map();
    let csrf;
    return async (path, body, method = body ? "POST" : "GET") => {
      const res = await fetch(base + path, {
        method,
        redirect: "manual",
        headers: {
          Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
          ...(body && { "Content-Type": "application/json", Origin: base }),
          ...(csrf && { "X-CSRF-Token": csrf }),
        },
        ...(body && { body: JSON.stringify(body) }),
      });
      for (const raw of res.headers.getSetCookie()) {
        const [name, value] = raw.split(";")[0].split("=");
        jar.set(name, value);
        if (name === "salon_guest") guestHash = tokenHash(value);
      }
      const data = res.headers.get("content-type")?.includes("json")
        ? await res.json()
        : await res.text();
      if (data.csrf) csrf = data.csrf;
      return { status: res.status, data };
    };
  }
  const admin = client(),
    guest = client(),
    stranger = client();
  assert.equal((await guest("/")).status, 200);
  assert.equal((await guest("/admin/")).status, 303);
  assert.equal((await guest("/api/admin/settings")).status, 401);
  assert.equal(
    (await admin("/api/auth/login", { email, password })).status,
    200,
  );
  assert.equal((await admin("/api/admin/system")).status, 403);
  assert.equal((await admin("/api/admin/accounts")).status, 403);
  const original = await getSettings(db);
  const forbidden = structuredClone(original);
  forbidden.config.name = "Forbidden verification edit";
  assert.equal(
    (await admin("/api/admin/settings", forbidden, "PUT")).status,
    403,
  );
  await promoteSuperadmin(db, email);
  assert.equal(
    (await admin("/api/auth/login", { email, password })).data.user.role,
    "superadmin",
  );
  assert.equal(
    (await admin("/api/admin/system")).data.database,
    "Supabase Postgres",
  );
  const newAccount = {
    email: `check-${randomUUID()}@example.invalid`,
    password: randomUUID() + randomUUID(),
  };
  const createdAdmin = await admin("/api/admin/accounts", newAccount);
  assert.equal(createdAdmin.status, 201);
  createdAdminId = createdAdmin.data.user.id;
  assert.equal(createdAdmin.data.user.role, "admin");
  assert.equal(createdAdmin.data.user.password_hash, undefined);
  const accounts = (await admin("/api/admin/accounts")).data.accounts;
  assert.ok(accounts.some((account) => account.id === createdAdminId));
  assert.ok(accounts.every((account) => !account.password_hash));
  assert.equal((await admin("/api/admin/accounts", newAccount)).status, 409);
  const newAdmin = client();
  assert.equal(
    (await newAdmin("/api/auth/login", newAccount)).data.user.role,
    "admin",
  );
  assert.equal((await newAdmin("/api/admin/accounts")).status, 403);
  assert.equal(
    (await admin("/api/admin/settings", original, "PUT")).status,
    200,
  );
  assert.deepEqual((await guest("/api/salon")).data.config, original.config);

  const started = await guest("/api/chat/conversations", {
    name: "Integration verification",
    message: "Temporary cloud chat verification",
  });
  assert.equal(started.status, 201);
  const id = started.data.conversation.id;
  assert.equal(
    (await stranger("/api/chat/conversation")).data.conversation,
    null,
  );
  assert.equal(
    (
      await stranger(`/api/chat/conversations/${id}/messages`, {
        message: "Denied",
      })
    ).status,
    404,
  );
  const inbox = (await admin("/api/admin/conversations")).data.conversations;
  assert.equal(
    inbox.find((item) => item.id === id).lastMessage,
    "Temporary cloud chat verification",
  );
  assert.ok(inbox.find((item) => item.id === id).updatedAt);
  assert.equal((await admin(`/api/admin/conversations/${id}`)).status, 200);
  assert.equal(
    (
      await admin(`/api/admin/conversations/${id}/messages`, {
        message: "Temporary admin reply",
      })
    ).status,
    201,
  );
  assert.equal(
    (await guest("/api/chat/conversation")).data.conversation.messages.at(-1)
      .body,
    "Temporary admin reply",
  );
  assert.ok(
    (await guest("/api/chat/conversation")).data.conversation.messages[0]
      .createdAt,
  );
  const appointment = await guest("/api/appointments", {
    name: "Integration verification",
    phone: "2025550147",
    service: original.config.services[0].items[0].id,
    branch: original.config.branches[0].id,
    datetime: "2099-02-20T14:30",
  });
  assert.equal(appointment.status, 201);
  appointmentId = appointment.data.id;
  assert.ok(
    (await admin("/api/admin/appointments")).data.requests.some(
      (row) => row.id === appointmentId,
    ),
  );
  const paymentInbox = (await admin("/api/admin/appointments")).data;
  const paymentAppointment = paymentInbox.requests.find(
    (row) => row.id === appointmentId,
  );
  assert.equal(paymentAppointment.payment.status, "Pending");
  paymentAppointment.billing = calculateBill(
    paymentAppointment.price,
    original.config.currency,
    {
      type: "Percent",
      value: 10,
      label: "Temporary cloud discount verification",
    },
  );
  paymentAppointment.payment = {
    ...paymentAppointment.payment,
    method: "Online",
    status: "Paid",
    amount: paymentAppointment.billing.total,
    receivedOn: salonDay(original.config.timeZone),
    reference: "TEST-RECORD-NO-REAL-TRANSFER",
  };
  const paymentSaved = await admin(
    "/api/admin/appointments",
    paymentInbox,
    "PUT",
  );
  assert.equal(paymentSaved.status, 200);
  const cloudRecord = JSON.parse(
    (
      await db
        .prepare("SELECT data FROM appointments WHERE id=?")
        .get(appointmentId)
    ).data,
  );
  assert.equal(cloudRecord.payment.reference, "TEST-RECORD-NO-REAL-TRANSFER");
  assert.equal(cloudRecord.payment.updatedBy, email);
  assert.equal(cloudRecord.payment.status, "Paid");
  assert.equal(cloudRecord.billing.total, paymentAppointment.billing.total);
  const monthly = monthlyReport(
    [cloudRecord],
    salonDay(original.config.timeZone).slice(0, 7),
  );
  assert.equal(monthly.currencies[0].received, cloudRecord.payment.amount);
  console.log(
    "Cloud HTTP checks passed: public site, login, superadmin permissions, admin creation, shared settings, appointments, manual payment records, private chat and admin replies.",
  );
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    await db.transaction(async () => {
      if (createdAdminId)
        await db.prepare("DELETE FROM users WHERE id=?").run(createdAdminId);
      if (appointmentId) {
        await db
          .prepare("DELETE FROM appointments WHERE id=?")
          .run(appointmentId);
        await db.exec(
          "UPDATE request_state SET revision=revision+1 WHERE id=1",
        );
      }
      if (guestHash) {
        await db
          .prepare("DELETE FROM conversations WHERE guest_hash=?")
          .run(guestHash);
        await db
          .prepare("DELETE FROM guest_sessions WHERE token_hash=?")
          .run(guestHash);
      }
      if (userId) await db.prepare("DELETE FROM users WHERE id=?").run(userId);
    });
  } finally {
    await db.close();
  }
}
