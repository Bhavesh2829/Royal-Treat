"use strict";
/* POST /api/chef — the kitchen's private link.
   Body: { key, since?, action?: "status", id?, status? }
   The chef can only move an order New -> Preparing -> Ready. No cancelling, no serving, no prices.
   First call returns all open orders; later calls return only what changed. */
const { db, send, fail, httpErr, applyStatus, memo, safeEq } = require("./_lib");

const slim = (d) => {
  const o = d.data();
  return {
    id: d.id, number: o.number, table: o.table, notes: o.notes || "", status: o.status, open: !!o.open,
    placedBy: o.placedBy, waiterName: o.waiterName || "", createdAtMs: o.createdAtMs, updatedAtMs: o.updatedAtMs,
    items: (o.items || []).map((i) => ({ name: i.name, qty: i.qty })),
  };
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { message: "Method not allowed" });
  try {
    const b = req.body || {};
    const k = String(b.key || "");
    if (k.length < 10) throw httpErr(401, "Invalid link");

    let chef = await memo("chef", 15000, async () => {
      const s = await db.doc("meta/chef").get();
      return s.exists ? s.data() : null;
    });
    // A just-reset link may not be in the cache yet: check the database once before refusing.
    if (!chef || !chef.key || !safeEq(chef.key, k)) {
      const s = await db.doc("meta/chef").get();
      chef = s.exists ? s.data() : null;
    }
    if (!chef || !chef.key || !safeEq(chef.key, k)) throw httpErr(401, "This link is not active");

    const acted = b.action === "status";
    if (acted) await applyStatus(b.id, String(b.status), { role: "chef" });

    const asOf = Date.now(), since = Number(b.since) || 0, full = acted || !since;
    const snap = full
      ? await db.collection("orders").where("open", "==", true).get()
      : await db.collection("orders").where("updatedAtMs", ">", since).get();
    send(res, 200, { full, asOf, orders: snap.docs.map(slim) });
  } catch (e) { fail(res, e); }
};
