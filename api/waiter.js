"use strict";
/* POST /api/waiter — waiter's private link.
   Body: { key, since?, action?: "status", id?, status? }
   A waiter can do ONE thing: mark a READY order as served. (The chef makes it ready.)
   First call returns all open orders; later calls return only what changed. */
const { db, send, fail, httpErr, applyStatus, memo, activeWaiterIds } = require("./_lib");

const slim = (d) => {
  const o = d.data();
  return {
    id: d.id, number: o.number, table: o.table, notes: o.notes || "", status: o.status, open: !!o.open,
    total: o.total, placedBy: o.placedBy, createdAtMs: o.createdAtMs, updatedAtMs: o.updatedAtMs,
    items: (o.items || []).map((i) => ({ name: i.name, qty: i.qty })),
    customerName: (o.customer && o.customer.name) || "",
  };
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { message: "Method not allowed" });
  try {
    const b = req.body || {};
    const k = String(b.key || "");
    if (k.length < 10) throw httpErr(401, "Invalid link");
    const w = await memo("waiter:" + k, 15000, async () => {
      const s = await db.collection("waiters").where("key", "==", k).limit(1).get();
      return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
    });
    if (!w || w.active === false) throw httpErr(401, "This link is not active");

    // Their own orders, plus any order whose waiter is no longer active (so nothing gets stuck).
    const live = await activeWaiterIds();
    const mine = (o) => !o.waiterId || o.waiterId === w.id || !live.has(o.waiterId);

    const acted = b.action === "status";
    if (acted) await applyStatus(b.id, String(b.status), { role: "waiter", allow: mine });

    const asOf = Date.now(), since = Number(b.since) || 0, full = acted || !since;
    const snap = full
      ? await db.collection("orders").where("open", "==", true).get()
      : await db.collection("orders").where("updatedAtMs", ">", since).get();
    const orders = snap.docs.filter((d) => mine(d.data())).map(slim);
    send(res, 200, { waiter: { name: w.name, tables: w.tables || [] }, full, asOf, orders });
  } catch (e) { fail(res, e); }
};
