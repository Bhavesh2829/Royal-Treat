"use strict";
/* POST /api/orders — the server recomputes everything. Browser prices are ignored. */
const crypto = require("crypto");
const { db, istDay, httpErr, getSettings, getMenu, totals, pickWaiter, send, fail } = require("../_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { message: "Method not allowed" });
  try {
    const b = req.body || {};
    const s = await getSettings();
    if (!s.isOpen) throw httpErr(400, "Ordering is paused right now");

    // Table must be a real table
    const tm = /^T(\d{2,3})$/.exec(String(b.table || ""));
    const tn = tm ? parseInt(tm[1], 10) : 0;
    if (!tn || tn > s.tableCount) throw httpErr(400, "Invalid table");
    const table = "T" + String(tn).padStart(2, "0");

    // Items: merge duplicates, check against OUR menu
    const wanted = new Map();
    (Array.isArray(b.items) ? b.items : []).forEach((r) => {
      const id = String(r && r.id);
      const qty = Math.floor(Number(r && r.qty));
      if (!id || !(qty > 0)) throw httpErr(400, "Invalid item");
      wanted.set(id, (wanted.get(id) || 0) + qty);
    });
    if (!wanted.size) throw httpErr(400, "Cart is empty");
    if (wanted.size > s.maxItems) throw httpErr(400, "Too many items");

    const menu = await getMenu();
    const byId = new Map(menu.items.map((i) => [String(i.id), i]));
    const items = [];
    let subtotal = 0;
    for (const [id, qty] of wanted) {
      const m = byId.get(id);
      if (!m || m.available === false || !(Number(m.price) > 0)) throw httpErr(400, "An item is unavailable");
      if (qty > s.maxQty) throw httpErr(400, "Quantity too high");
      items.push({ id, name: m.name, price: Number(m.price), qty, lineTotal: Number(m.price) * qty });
      subtotal += Number(m.price) * qty;
    }
    const t = totals(subtotal, s);

    // Customer details (optional)
    const name = String((b.customer && b.customer.name) || "").trim().slice(0, 60);
    let phone = String((b.customer && b.customer.phone) || "").replace(/\D/g, "");
    if (phone.length === 12 && phone.startsWith("91")) phone = phone.slice(2);
    if (phone.length === 11 && phone.startsWith("0")) phone = phone.slice(1);
    if (phone && !/^[6-9]\d{9}$/.test(phone)) throw httpErr(400, "Invalid phone");
    const notes = String(b.notes || "").trim().slice(0, 200);

    // Who handles it? A waiter taking the order themselves, or auto-assign.
    let waiter = null, placedBy = "customer";
    const key = String(req.headers["x-waiter-key"] || "");
    if (key.length >= 10) {
      const w = await db.collection("waiters").where("key", "==", key).limit(1).get();
      if (!w.empty && w.docs[0].data().active !== false) {
        waiter = { id: w.docs[0].id, ...w.docs[0].data() };
        placedBy = "waiter";
      }
    }
    if (!waiter) waiter = await pickWaiter(table);

    // Idempotency: same clientOrderId -> same order, never a duplicate
    const cid = String(b.clientOrderId || req.headers["idempotency-key"] || "");
    if (cid.length < 8 || cid.length > 100) throw httpErr(400, "Missing order id");
    const idemRef = db.doc("idem/" + crypto.createHash("sha1").update(cid).digest("hex"));
    const counter = db.doc("meta/orderCounter");
    const day = istDay();
    const statRef = db.doc(`stats/${day}`);

    const out = await db.runTransaction(async (tx) => {
      const idem = await tx.get(idemRef);
      if (idem.exists) return idem.data();
      const c = await tx.get(counter);
      const st = await tx.get(statRef);
      const number = (c.exists ? c.data().n : 1000) + 1;
      const ref = db.collection("orders").doc();
      const stats = { sales: 0, orders: 0, itemsServed: 0, servedOrders: 0, ...(st.data() || {}) };
      stats.sales = Math.round((stats.sales + t.total) * 100) / 100;
      stats.orders += 1;
      const now = Date.now();
      tx.set(ref, {
        number, table, items, notes, placedBy, day,
        customer: { name, phone },
        paymentMethod: "counter",
        ...t, currency: "₹",
        status: "received", open: true,
        waiterId: waiter ? waiter.id : null,
        waiterName: waiter ? waiter.name : "",
        clientOrderId: cid,
        createdAtMs: now, updatedAtMs: now,
      });
      tx.set(counter, { n: number });
      tx.set(statRef, stats);
      const reply = { id: ref.id, number, status: "received" };
      tx.set(idemRef, { ...reply, at: now });
      return reply;
    });
    send(res, 200, out);
  } catch (e) { fail(res, e); }
};
