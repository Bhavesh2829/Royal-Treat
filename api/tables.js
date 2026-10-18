"use strict";
const { getSettings, send, fail } = require("./_lib");

module.exports = async (req, res) => {
  try {
    const s = await getSettings();
    const rows = Array.from({ length: s.tableCount }, (_, i) => {
      const id = "T" + String(i + 1).padStart(2, "0");
      return { id, label: id, status: "available" };
    });
    send(res, 200, rows);
  } catch (e) { fail(res, e); }
};
