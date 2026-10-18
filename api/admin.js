"use strict";
/* POST /api/admin — owner dashboard. Body: { action, ...data }. Everything except "login" needs a token. */
const crypto = require("crypto");
const { db, sign, verify, send, fail, getSettings, getMenu, istDay, applyStatus, DEFAULTS, httpErr } = require("./_lib");

const MENU = db.doc("meta/menu");
const SET = db.doc("meta/settings");
const CHEF = db.doc("meta/chef");
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cat-" + Date.now();
const nextId = (m) => Math.max(0, ...m.items.map((i) => Number(i.id) || 0)) + 1;

/* Read-modify-write the whole menu safely (one document). */
const mutateMenu = (fn) =>
  db.runTransaction(async (t) => {
    const s = await t.get(MENU);
    const m = s.exists ? s.data() : {};
    m.categories = m.categories || [];
    m.items = m.items || [];
    const out = fn(m);
    t.set(MENU, m);
    return out === undefined ? m : out;
  });
const menuOf = (fn) => mutateMenu(fn).then(() => getMenu()).then((menu) => ({ menu }));

function cleanItem(r, m) {
  const name = String(r.name || "").trim().slice(0, 80);
  if (!name) throw httpErr(400, "Dish name is required");
  let category = String(r.category || "");
  if (!m.categories.find((c) => c.id === category)) {
    const cn = String(r.categoryName || "").trim();
    if (!cn) throw httpErr(400, "Choose a category");
    let c = m.categories.find((x) => x.name.toLowerCase() === cn.toLowerCase());
    if (!c) { c = { id: slug(cn), name: cn.slice(0, 40), emoji: "🍽️", image: "" }; m.categories.push(c); }
    category = c.id;
  }
  const price = r.price === null || r.price === "" || r.price === undefined ? NaN : Number(r.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  const priceLabel = String(r.priceLabel || "").trim().slice(0, 20);
  if (!hasPrice && !priceLabel) throw httpErr(400, "Enter a valid price");
  return {
    name, category,
    price: hasPrice ? Math.round(price * 100) / 100 : null,
    priceLabel: hasPrice ? "" : priceLabel,
    veg: !!r.veg,
    available: r.available !== false,
    description: String(r.description || "").trim().slice(0, 300),
    image: String(r.image || "").trim().slice(0, 500),
  };
}

const normTables = (v) =>
  [...new Set(String(v || "").split(/[\s,]+/).map((x) => x.replace(/\D/g, "")).filter(Boolean)
    .map((n) => "T" + String(parseInt(n, 10)).padStart(2, "0")))];

const ACTIONS = {
  /* ---------- orders ---------- */
  /* First call (no `since`): every open order + today's stats.
     After that: only orders that changed since the last check, so each refresh is tiny and fast. */
  async dashboard(b) {
    const asOf = Date.now(), today = istDay(), since = Number(b.since) || 0;
    const pack = (docs) => docs.map((d) => ({ id: d.id, ...d.data() }));
    const stats = async () => ({ sales: 0, orders: 0, itemsServed: 0, servedOrders: 0, ...((await db.doc(`stats/${today}`).get()).data() || {}) });
    if (!since) {
      const [o, st] = await Promise.all([db.collection("orders").where("open", "==", true).get(), stats()]);
      return { full: true, orders: pack(o.docs), stats: st, asOf, day: today };
    }
    const o = await db.collection("orders").where("updatedAtMs", ">", since).get();
    const out = { full: false, changed: pack(o.docs), asOf, day: today };
    if (o.size || b.day !== today) out.stats = await stats();
    return out;
  },
  async history() {
    const o = await db.collection("orders").where("day", "==", istDay()).where("open", "==", false).get();
    return { orders: o.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 100) };
  },
  /* The owner can only cancel. The chef prepares, the waiter serves. */
  async status(b) {
    if (String(b.status) !== "cancelled") throw httpErr(403, "The owner can only cancel orders. The kitchen and waiters move orders forward.");
    await applyStatus(b.id, "cancelled", { role: "owner" });
    return { ok: true };
  },

  /* ---------- kitchen (chef) link ---------- */
  async chef_get() {
    const s = await CHEF.get();
    if (s.exists && s.data().key) return { chef: s.data() };
    return ACTIONS.chef_reset();
  },
  async chef_reset() {
    const chef = { key: crypto.randomBytes(12).toString("hex"), createdAtMs: Date.now() };
    await CHEF.set(chef);
    return { chef };
  },

  /* ---------- menu ---------- */
  async menu_get() { return { menu: await getMenu() }; },
  item_save: (b) => menuOf((m) => {
    const raw = b.item || {};
    const it = cleanItem(raw, m);
    const idx = raw.id != null ? m.items.findIndex((i) => String(i.id) === String(raw.id)) : -1;
    if (idx >= 0) m.items[idx] = { ...m.items[idx], ...it };
    else m.items.push({ id: nextId(m), ...it });
  }),
  item_toggle: (b) => menuOf((m) => {
    const i = m.items.find((x) => String(x.id) === String(b.id));
    if (!i) throw httpErr(404, "Dish not found");
    i.available = !!b.available;
  }),
  item_delete: (b) => menuOf((m) => {
    m.items = m.items.filter((x) => String(x.id) !== String(b.id));
  }),
  cat_save: (b) => menuOf((m) => {
    const name = String(b.name || "").trim().slice(0, 40);
    if (!name) throw httpErr(400, "Category name is required");
    if (m.categories.find((c) => c.name.toLowerCase() === name.toLowerCase())) throw httpErr(400, "Category already exists");
    m.categories.push({ id: slug(name), name, emoji: String(b.emoji || "🍽️").slice(0, 4), image: "" });
  }),
  async menu_import(b) {
    const stat = { added: 0, updated: 0, skipped: 0 };
    const rows = Array.isArray(b.items) ? b.items.slice(0, 1000) : [];
    await mutateMenu((m) => {
      (b.categories || []).forEach((c) => {
        if (c && c.id && c.name && !m.categories.find((x) => x.id === String(c.id))) {
          m.categories.push({ id: String(c.id), name: String(c.name).slice(0, 40), emoji: c.emoji || "🍽️", image: String(c.image || "").slice(0, 500) });
        }
      });
      rows.forEach((raw) => {
        let it;
        try { it = cleanItem(raw, m); } catch (_) { stat.skipped++; return; }
        const idx = raw.id != null ? m.items.findIndex((i) => String(i.id) === String(raw.id)) : -1;
        if (idx >= 0) { m.items[idx] = { ...m.items[idx], ...it }; stat.updated++; }
        else {
          const want = Number(raw.id);
          const id = Number.isInteger(want) && want > 0 && !m.items.some((i) => Number(i.id) === want) ? want : nextId(m);
          m.items.push({ id, ...it }); stat.added++;
        }
      });
    });
    return { menu: await getMenu(), ...stat };
  },

  /* ---------- waiters ---------- */
  async waiters_list() {
    const s = await db.collection("waiters").get();
    return { waiters: s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0)) };
  },
  async waiter_save(b) {
    const name = String(b.name || "").trim().slice(0, 40);
    let phone = String(b.phone || "").replace(/\D/g, "");
    if (phone.length === 12 && phone.startsWith("91")) phone = phone.slice(2);
    if (!name) throw httpErr(400, "Waiter name is required");
    if (!/^[6-9]\d{9}$/.test(phone)) throw httpErr(400, "Enter a valid 10-digit mobile number");
    const data = { name, phone, tables: normTables(b.tables), active: b.active !== false };
    if (b.id) await db.collection("waiters").doc(String(b.id)).update(data);
    else await db.collection("waiters").add({ ...data, key: crypto.randomBytes(12).toString("hex"), createdAtMs: Date.now() });
    return ACTIONS.waiters_list();
  },
  async waiter_delete(b) {
    await db.collection("waiters").doc(String(b.id)).delete();
    return ACTIONS.waiters_list();
  },

  /* ---------- settings ---------- */
  async settings_get() { return { settings: await getSettings() }; },
  async settings_save(b) {
    const num = (v, lo, hi, label) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < lo || n > hi) throw httpErr(400, `${label} must be between ${lo} and ${hi}`);
      return n;
    };
    const data = {
      isOpen: !!b.isOpen,
      gstPercent: num(b.gstPercent, 0, 100, "GST"),
      servicePercent: num(b.servicePercent, 0, 100, "Service charge"),
      tableCount: Math.round(num(b.tableCount, 1, 200, "Tables")),
      pricesIncludeTax: !!b.pricesIncludeTax,
    };
    await SET.set(data, { merge: true });
    return { settings: { ...DEFAULTS, ...data } };
  },
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { message: "Method not allowed" });
  const b = req.body || {};
  try {
    if (b.action === "login") {
      const pw = process.env.ADMIN_PASSWORD;
      const ok = !!pw && crypto.timingSafeEqual(sha(b.password || ""), sha(pw));
      if (!ok) { await new Promise((r) => setTimeout(r, 1000)); throw httpErr(401, "Wrong password"); }
      return send(res, 200, { token: sign({ role: "admin", exp: Date.now() + 12 * 3600e3 }) });
    }
    const a = verify((req.headers.authorization || "").replace(/^Bearer /, ""));
    if (!a || a.role !== "admin") throw httpErr(401, "Please log in again");
    const act = Object.prototype.hasOwnProperty.call(ACTIONS, b.action) ? ACTIONS[b.action] : null;
    if (!act) throw httpErr(400, "Unknown action");
    send(res, 200, await act(b));
  } catch (e) { fail(res, e); }
};
