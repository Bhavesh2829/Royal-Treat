"use strict";
/* GET /api/orders/:id — customer status check. Ids are random, so they can't be guessed. */
const { db, send, fail, httpErr } = require("../_lib");

module.exports = async (req, res) => {
  try {
    const id = String((req.query && req.query.id) || "");
    if (!/^[A-Za-z0-9]{10,40}$/.test(id)) throw httpErr(404, "Order not found");
    const s = await db.collection("orders").doc(id).get();
    if (!s.exists) throw httpErr(404, "Order not found");
    const o = s.data();
    send(res, 200, { id: s.id, number: o.number, status: o.status });
  } catch (e) { fail(res, e); }
};
