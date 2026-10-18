"use strict";
const { getSettings, send, fail } = require("./_lib");

module.exports = async (req, res) => {
  try {
    const s = await getSettings();
    send(res, 200, { name: s.restaurantName, isOpen: !!s.isOpen });
  } catch (e) { fail(res, e); }
};
