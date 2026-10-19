"use strict";
const { getMenu, fail } = require("./_lib");

// Category photos (square PNG for the small circles).
// Only categories listed here are changed. Any category not listed keeps
// whatever image it already has in Firestore, so nothing else is affected.
const png = (id) =>
  `https://images.unsplash.com/${id}?fm=png&fit=crop&w=400&h=400&q=80`;

const CATEGORY_IMAGES = {
  "veg-starters":  png("photo-1601050690597-df0568f70950"), // samosas
  "veg-mains":     png("photo-1585937421612-70a008356fbe"), // curry in steel bowl
  "tandoori":      png("photo-1555939594-58d7cb561ad1"),    // grilled meat
  "chicken-mains": png("photo-1772730064951-89b427965dbc"), // chicken tikka masala
  "thali":         png("photo-1625398407796-82650a8c135f"), // thali on banana leaf
  "fish-fry":      png("photo-1786227905994-235e1799292e"), // Kerala fried fish meal
  "biryani":       png("photo-1631515243349-e0cb75fb8d3a"), // chicken biryani
  "pulao":         png("photo-1767114915989-c6ab3c8fc42e"), // rice bowls
  "bread":         png("photo-1600935926387-12d9b03066f0"), // roti / naan
  "beverages":     png("photo-1621330716555-5cad596c4562"), // iced lemon drink
};

module.exports = async (req, res) => {
  try {
    const m = await getMenu();
    const categories = m.categories.map((c) =>
      CATEGORY_IMAGES[c.id] ? { ...c, image: CATEGORY_IMAGES[c.id] } : c
    );
    // Short CDN cache keeps Firestore reads low; owner edits show within ~20s.
    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
    res.status(200).json({ categories, items: m.items });
  } catch (e) { fail(res, e); }
};