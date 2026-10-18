"use strict";
/* POST /api/waiter — waiter's private link. Body: { key, action?: "status", id?, status? } */
const { db, send, fail, httpErr, applyStatus } = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return send(res, 405, { message: "Method not allowed" });
  try {
    const b = req.body || {};
    const k = String(b.key || "");
    if (k.length < 10) throw httpErr(401, "Invalid link");
    const ws = await db.collection("waiters").where("key", "==", k).limit(1).get();
    if (ws.empty || ws.docs[0].data().active === false) throw httpErr(401, "This link is not active");
    const w = { id: ws.docs[0].id, ...ws.docs[0].data() };

    if (b.action === "status") {
      await applyStatus(b.id, String(b.status), { waiterId: w.id, canCancel: false });
    }

    const snap = await db.collection("orders")
      .where("waiterId", "==", w.id).where("open", "==", true).get();
    const orders = snap.docs
      .map((d) => {
        const o = d.data();
        return {
          id: d.id, number: o.number, table: o.table, items: o.items, notes: o.notes,
          status: o.status, total: o.total, createdAtMs: o.createdAtMs, placedBy: o.placedBy,
          customerName: (o.customer && o.customer.name) || "",
        };
      })
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
    send(res, 200, { waiter: { name: w.name, tables: w.tables || [] }, orders });
  } catch (e) { fail(res, e); }
};
