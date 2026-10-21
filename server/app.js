import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getSettings, getAppointments, transaction } from "./database.js";
import {
  adminSession,
  cookies,
  newToken,
  tokenHash,
  hashPassword,
  verifyPassword,
} from "./auth.js";
import {
  validateConfig,
  validateRequests,
  makeRequest,
} from "../src/admin/store.js";
import { validateBooking } from "../src/booking.js";

const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (value, label, max, required = true) => {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw fail(400, `Enter a valid ${label} (up to ${max} characters).`);
  return value.trim();
};
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

export async function createApp({
  db,
  production = false,
  appOrigin = "",
  vite = null,
  dist = resolve("dist"),
  limits = true,
  trustProxy = false,
}) {
  const app = express();
  app.disable("x-powered-by");
  if (trustProxy) app.set("trust proxy", trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              imgSrc: ["'self'", "data:", "https:", "http:"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: "6mb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const expected = appOrigin || `${req.protocol}://${req.get("host")}`;
      if (req.get("origin") !== expected)
        return next(
          fail(403, "Request origin was not accepted. Refresh and try again."),
        );
      if (!req.is("application/json"))
        return next(fail(415, "Send JSON data."));
      if (!req.body || Array.isArray(req.body) || typeof req.body !== "object")
        return next(fail(400, "Send a JSON object."));
    }
    next();
  });
  const publicLimiter = rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Too many requests. Please wait a minute and try again.",
    },
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many login attempts. Try again in 15 minutes." },
  });
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    path: "/",
  };
  const requireAdmin = (req, res, next) => {
    req.admin = adminSession(db, req);
    if (!req.admin) return next(fail(401, "Sign in to continue."));
    if (req.admin.role !== "admin")
      return next(
        fail(403, "This account is not authorized to manage the salon."),
      );
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.get("x-csrf-token") !== req.admin.csrf
    )
      return next(
        fail(
          403,
          "Your session token was not accepted. Refresh and try again.",
        ),
      );
    next();
  };
  function guest(req, res, create = false) {
    const token = cookies(req).salon_guest;
    const hash = token && /^[a-f\d]{64}$/.test(token) ? tokenHash(token) : "";
    if (
      hash &&
      db
        .prepare(
          "SELECT token_hash FROM guest_sessions WHERE token_hash=? AND expires_at>?",
        )
        .get(hash, Date.now())
    )
      return hash;
    if (!create) return null;
    const fresh = newToken();
    const token_hash = tokenHash(fresh);
    db.prepare("INSERT INTO guest_sessions VALUES(?,?)").run(
      token_hash,
      Date.now() + 30 * 86400000,
    );
    res.cookie("salon_guest", fresh, {
      ...cookieOptions,
      maxAge: 30 * 86400000,
    });
    return token_hash;
  }
  const messageList = (id) =>
    db
      .prepare(
        "SELECT id,sender,body,created_at AS createdAt FROM messages WHERE conversation_id=? ORDER BY id",
      )
      .all(id);
  function addMessage(id, sender, body) {
    const created = new Date().toISOString();
    db.prepare(
      "INSERT INTO messages(conversation_id,sender,body,created_at) VALUES(?,?,?,?)",
    ).run(id, sender, body, created);
    db.prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(
      created,
      id,
    );
  }
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/salon", (req, res) => res.json(getSettings(db)));
  app.get("/api/salon/version", (req, res) =>
    res.json({
      revision: db.prepare("SELECT revision FROM settings WHERE id=1").get()
        .revision,
    }),
  );
  const dummyHash = await hashPassword(newToken());
  app.post(
    "/api/auth/login",
    ...(limits ? [loginLimiter] : []),
    async (req, res) => {
      const email =
        typeof req.body.email === "string"
          ? req.body.email.trim().toLowerCase()
          : "";
      const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
      const valid = await verifyPassword(
        req.body.password,
        user?.password_hash || dummyHash,
      );
      if (!valid || !user || user.role !== "admin")
        throw fail(401, "Email or password was not accepted.");
      const old = cookies(req).salon_session;
      if (old)
        db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
          tokenHash(old),
        );
      const token = newToken();
      const csrf = newToken();
      db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
        tokenHash(token),
        user.id,
        csrf,
        Date.now() + 8 * 3600000,
      );
      res.cookie("salon_session", token, {
        ...cookieOptions,
        maxAge: 8 * 3600000,
      });
      res.json({ user: { email: user.email, role: user.role }, csrf });
    },
  );
  app.get("/api/auth/session", requireAdmin, (req, res) =>
    res.json({
      user: { email: req.admin.email, role: req.admin.role },
      csrf: req.admin.csrf,
    }),
  );
  app.post("/api/auth/logout", requireAdmin, (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
      tokenHash(cookies(req).salon_session),
    );
    res.clearCookie("salon_session", cookieOptions).json({ ok: true });
  });
  app.use("/api/admin", requireAdmin);
  app.get("/api/admin/settings", (req, res) => res.json(getSettings(db)));
  app.put("/api/admin/settings", (req, res) => {
    try {
      validateConfig(req.body.config);
    } catch (error) {
      throw fail(400, error.message);
    }
    const update = db
      .prepare(
        "UPDATE settings SET data=?,revision=revision+1 WHERE id=1 AND revision=?",
      )
      .run(JSON.stringify(req.body.config), Number(req.body.revision));
    if (!update.changes)
      throw fail(
        409,
        "Salon settings changed elsewhere. Reload before editing again. Your unsaved changes have not been applied.",
      );
    res.json(getSettings(db));
  });
  app.get("/api/admin/appointments", (req, res) =>
    res.json(getAppointments(db)),
  );
  app.put("/api/admin/appointments", (req, res) => {
    try {
      validateRequests(req.body.requests);
    } catch (error) {
      throw fail(400, error.message);
    }
    transaction(db, () => {
      const update = db
        .prepare(
          "UPDATE request_state SET revision=revision+1 WHERE id=1 AND revision=?",
        )
        .run(Number(req.body.revision));
      if (!update.changes)
        throw fail(
          409,
          "The appointment inbox changed. Reload to include the latest requests before saving.",
        );
      db.exec("DELETE FROM appointments");
      const insert = db.prepare("INSERT INTO appointments VALUES(?,?)");
      req.body.requests.forEach((item) =>
        insert.run(item.id, JSON.stringify(item)),
      );
    });
    res.json(getAppointments(db));
  });
  app.post(
    "/api/appointments",
    ...(limits ? [publicLimiter] : []),
    (req, res) => {
      const { config } = getSettings(db);
      const values = req.body;
      if (
        !["name", "phone", "service", "branch", "datetime"].every(
          (key) => typeof values[key] === "string",
        )
      )
        throw fail(400, "Complete all appointment fields.");
      const errors = validateBooking(values, config);
      if (
        Object.keys(errors).length ||
        typeof values.name !== "string" ||
        values.name.length > 100 ||
        values.phone.length > 30
      )
        throw fail(
          400,
          Object.values(errors).join(" ") ||
            "Check your name and phone number.",
        );
      const request = makeRequest(values, config, "Website");
      transaction(db, () => {
        if (
          db.prepare("SELECT count(*) AS count FROM appointments").get()
            .count >= 2000
        )
          throw fail(
            503,
            "Online enquiries are temporarily full. Please contact the salon by phone.",
          );
        db.prepare("INSERT INTO appointments VALUES(?,?)").run(
          request.id,
          JSON.stringify(request),
        );
        db.exec("UPDATE request_state SET revision=revision+1 WHERE id=1");
      });
      res.status(201).json({ id: request.id, status: request.status });
    },
  );
  app.get("/api/chat/conversation", (req, res) => {
    const owner = guest(req, res);
    const row = owner
      ? db
          .prepare(
            "SELECT id,name,phone FROM conversations WHERE guest_hash=? ORDER BY updated_at DESC LIMIT 1",
          )
          .get(owner)
      : null;
    res.json({
      conversation: row ? { ...row, messages: messageList(row.id) } : null,
    });
  });
  app.post(
    "/api/chat/conversations",
    ...(limits ? [publicLimiter] : []),
    (req, res) => {
      const name = text(req.body.name, "name", 100);
      const phone = text(req.body.phone || "", "phone", 30, false);
      const body = text(req.body.message, "message", 2000);
      const owner = guest(req, res, true);
      if (
        db
          .prepare(
            "SELECT count(*) AS count FROM conversations WHERE guest_hash=?",
          )
          .get(owner).count >= 10
      )
        throw fail(
          429,
          "You have several conversations open. Continue an existing conversation.",
        );
      const id = randomUUID();
      const now = new Date().toISOString();
      transaction(db, () => {
        db.prepare(
          "INSERT INTO conversations(id,guest_hash,name,phone,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        ).run(id, owner, name, phone, now, now);
        addMessage(id, "customer", body);
      });
      res
        .status(201)
        .json({ conversation: { id, name, phone, messages: messageList(id) } });
    },
  );
  app.post(
    "/api/chat/conversations/:id/messages",
    ...(limits ? [publicLimiter] : []),
    (req, res) => {
      const owner = guest(req, res);
      if (
        !owner ||
        !db
          .prepare("SELECT id FROM conversations WHERE id=? AND guest_hash=?")
          .get(req.params.id, owner)
      )
        throw fail(404, "Conversation not found in this browser.");
      const body = text(req.body.message, "message", 2000);
      addMessage(req.params.id, "customer", body);
      res.status(201).json({ messages: messageList(req.params.id) });
    },
  );
  app.get("/api/admin/conversations", (req, res) =>
    res.json({
      conversations: db
        .prepare(
          `SELECT c.id,c.name,c.phone,c.updated_at AS updatedAt,(SELECT body FROM messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) AS lastMessage,(SELECT count(*) FROM messages WHERE conversation_id=c.id AND sender='customer' AND created_at>c.admin_read_at) AS unread FROM conversations c ORDER BY updated_at DESC`,
        )
        .all(),
      whatsappSync: false,
    }),
  );
  app.get("/api/admin/conversations/:id", (req, res) => {
    const row = db
      .prepare("SELECT id,name,phone FROM conversations WHERE id=?")
      .get(req.params.id);
    if (!row) throw fail(404, "Conversation not found.");
    const messages = messageList(row.id);
    db.prepare("UPDATE conversations SET admin_read_at=? WHERE id=?").run(
      new Date().toISOString(),
      row.id,
    );
    res.json({ conversation: { ...row, messages } });
  });
  app.post("/api/admin/conversations/:id/messages", (req, res) => {
    if (
      !db.prepare("SELECT id FROM conversations WHERE id=?").get(req.params.id)
    )
      throw fail(404, "Conversation not found.");
    const body = text(req.body.message, "reply", 2000);
    addMessage(req.params.id, "admin", body);
    res.status(201).json({ messages: messageList(req.params.id) });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use("/admin", (req, res, next) => {
    res
      .set("Cache-Control", "no-store")
      .set("X-Robots-Tag", "noindex, nofollow");
    if (req.path === "/login" || req.path === "/login/") return next();
    const session = adminSession(db, req);
    if (!session) return res.redirect(303, "/admin/login");
    if (session.role !== "admin")
      return res
        .status(403)
        .send("This account cannot access salon administration.");
    next();
  });
  async function page(req, res, next) {
    try {
      const isLogin = /^\/admin\/login\/?$/.test(req.path);
      const isAdmin = req.path.startsWith("/admin");
      const file = isLogin
        ? "admin/login/index.html"
        : isAdmin
          ? "admin/index.html"
          : "index.html";
      let html = await readFile(resolve(vite ? "." : dist, file), "utf8");
      if (vite) html = await vite.transformIndexHtml(req.originalUrl, html);
      if (!isAdmin) {
        const { config } = getSettings(db);
        html = html
          .replace(
            /<title>.*?<\/title>/,
            () => `<title>${escape(config.seo.title)}</title>`,
          )
          .replace(
            /(<meta\s+name="description"\s+content=")[^"]*/,
            (_, prefix) => prefix + escape(config.seo.description),
          )
          .replace(
            /(<meta property="og:title" content=")[^"]*/,
            (_, prefix) => prefix + escape(config.seo.title),
          )
          .replace(
            /(<meta property="og:description" content=")[^"]*/,
            (_, prefix) => prefix + escape(config.seo.description),
          )
          .replace(
            /(<meta name="theme-color" content=")[^"]*/,
            (_, prefix) => prefix + escape(config.theme.ink),
          )
          .replace(
            /(<link rel="icon"[^>]*href=")[^"]*/,
            (_, prefix) => prefix + escape(config.favicon),
          )
          .replace(/<meta name="robots" content="noindex, nofollow">/g, "");
        if (config.demoMode)
          html = html.replace(
            "</head>",
            '<meta name="robots" content="noindex, nofollow"></head>',
          );
      }
      res.type("html").send(html);
    } catch (error) {
      next(error);
    }
  }
  app.get(["/", "/admin", "/admin/", "/admin/login", "/admin/login/"], page);
  app.get(/^\/admin\/(?!login(?:\/|$)).*/, page);
  if (vite) app.use(vite.middlewares);
  else app.use(express.static(dist, { index: false, dotfiles: "deny" }));
  app.use((req, res) => res.status(404).send("Page not found."));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error.status || (error.type === "entity.too.large" ? 413 : 500);
    if (status >= 500) console.error("Request failed:", error.message);
    res.status(status).json({
      error:
        status === 500
          ? "Something went wrong. Please try again."
          : error.message,
    });
  });
  return app;
}
