"use strict";
const { getMenu, fail } = require("./_lib");

module.exports = async (req, res) => {
  try {
    const m = await getMenu();
    // Short CDN cache keeps Firestore reads low; owner edits show within ~20s.
    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
    res.status(200).json({ categories: m.categories, items: m.items });
  } catch (e) { fail(res, e); }
};
