"use strict";
/* Shared helpers for every API route. Runs on Vercel (server only). */
const admin = require("firebase-admin");
const crypto = require("crypto");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}
const db = admin.firestore();

/* ---------- time (India) ---------- */
const IST = 5.5 * 3600 * 1000;
const istDay = (ms = Date.now()) => new Date(ms + IST).toISOString().slice(0, 10);

/* ---------- settings & menu (one doc each = cheap reads) ---------- */
const DEFAULTS = {
  restaurantName: "Royal Treat",
  isOpen: true,
  gstPercent: 5,
  servicePercent: 0,
  pricesIncludeTax: false,
  tableCount: 18,
  maxQty: 20,
  maxItems: 50,
};
const httpErr = (status, message) => Object.assign(new Error(message), { status });

async function getSettings() {
  const s = await db.doc("meta/settings").get();
  return { ...DEFAULTS, ...(s.data() || {}) };
}
async function getMenu() {
  const d = (await db.doc("meta/menu").get()).data() || {};
  return { categories: d.categories || [], items: d.items || [] };
}

/* Same maths as config.js calculateTotals, but authoritative. */
function totals(subtotal, s) {
  const base = Math.max(0, Number(subtotal) || 0);
  const service = (base * s.servicePercent) / 100;
  const taxable = base + service;
  let tax, total;
  if (s.pricesIncludeTax) {
    tax = taxable - taxable / (1 + s.gstPercent / 100);
    total = taxable;
  } else {
    tax = (taxable * s.gstPercent) / 100;
    total = taxable + tax;
  }
  const r = (x) => Math.round(x * 100) / 100;
  return { subtotal: r(base), service: r(service), tax: r(tax), total: r(total) };
}

/* ---------- signed login tokens (admin) ---------- */
const mac = (body) =>
  crypto.createHmac("sha256", process.env.SESSION_SECRET || "").update(body).digest("base64url");
function sign(payload) {
  if (!process.env.SESSION_SECRET) throw httpErr(500, "Server not configured");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}
function verify(token) {
  if (!process.env.SESSION_SECRET) return null;
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch (_) { return null; }
}

/* ---------- responses ---------- */
function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}
function fail(res, e) {
  if (!e.status) console.error(e);
  send(res, e.status || 500, { message: e.status ? e.message : "Server error" });
}

/* ---------- order status changes: who may do what ----------
   chef   : received -> preparing -> ready
   waiter : ready -> served (their own orders)
   owner  : cancel an active order
   Enforced here on the server, so hiding buttons is never the only protection. */
const FLOW = {
  chef: { received: ["preparing"], preparing: ["ready"] },
  waiter: { ready: ["served"] },
  owner: { received: ["cancelled"], preparing: ["cancelled"], ready: ["cancelled"] },
};
async function applyStatus(id, status, { role, allow = null } = {}) {
  if (!Object.prototype.hasOwnProperty.call(FLOW, role)) throw httpErr(403, "Not allowed");
  const ref = db.collection("orders").doc(String(id));
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw httpErr(404, "Order not found");
    const o = snap.data();
    if (allow && !allow(o)) throw httpErr(403, "This is not your order");
    if (o.status === status) return; // double tap: already done, nothing to change
    if (!(FLOW[role][o.status] || []).includes(status)) {
      throw httpErr(400, "That status change is not allowed");
    }
    const statRef = db.doc(`stats/${o.day}`);
    const st = await t.get(statRef);
    const s = { sales: 0, orders: 0, itemsServed: 0, servedOrders: 0, ...(st.data() || {}) };
    if (status === "served") {
      s.itemsServed += o.items.reduce((n, i) => n + i.qty, 0);
      s.servedOrders += 1;
    }
    if (status === "cancelled") {
      s.sales = Math.round((s.sales - o.total) * 100) / 100;
      s.orders -= 1;
    }
    t.set(statRef, s);
    t.update(ref, {
      status,
      open: status !== "served" && status !== "cancelled",
      updatedAtMs: Date.now(),
    });
  });
}

/* ---------- tiny per-instance cache: screens poll every few seconds, this saves database reads ---------- */
const _memo = new Map();
async function memo(key, ttl, load) {
  const hit = _memo.get(key), now = Date.now();
  if (hit && hit.exp > now) return hit.val;
  const val = await load();
  if (val != null) { if (_memo.size > 200) _memo.clear(); _memo.set(key, { val, exp: now + ttl }); }
  return val;
}
const activeWaiterIds = () => memo("active-waiters", 15000, async () => {
  const s = await db.collection("waiters").where("active", "==", true).get();
  return new Set(s.docs.map((d) => d.id));
});
const hash = (s) => crypto.createHash("sha256").update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));

/* ---------- which waiter gets a new order ---------- */
async function pickWaiter(table) {
  const snap = await db.collection("waiters").where("active", "==", true).get();
  const ws = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (!ws.length) return null;
  const owner = ws.find((w) => (w.tables || []).includes(table)); // table assigned to a waiter
  if (owner) return owner;
  const open = await db.collection("orders").where("open", "==", true).get(); // else least busy
  const load = {};
  open.docs.forEach((d) => { const w = d.data().waiterId; if (w) load[w] = (load[w] || 0) + 1; });
  return ws.sort((a, b) => (load[a.id] || 0) - (load[b.id] || 0))[0];
}

module.exports = {
  admin, db, istDay, DEFAULTS, httpErr, getSettings, getMenu, totals,
  sign, verify, send, fail, applyStatus, pickWaiter, memo, activeWaiterIds, safeEq,
};
