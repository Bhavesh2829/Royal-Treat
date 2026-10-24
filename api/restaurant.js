"use strict";
const { getSettings, send, fail } = require("./_lib");

module.exports = async (req, res) => {
  try {
    const s = await getSettings();
    send(res, 200, {
      name: s.restaurantName,
      isOpen: !!s.isOpen,
      gstPercent: s.gstEnabled === false ? 0 : s.gstPercent,
      servicePercent: s.servicePercent,
      pricesIncludeTax: !!s.pricesIncludeTax,
    });
  } catch (e) { fail(res, e); }
};