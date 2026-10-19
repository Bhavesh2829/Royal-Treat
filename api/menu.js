"use strict";
const { getMenu, fail } = require("./_lib");

// Photos are matched by NAME (not id), so they keep working even if the menu
// is deleted and re-imported from CSV. Anything not listed keeps whatever
// image it already has in Firestore.
const key = (s) => String(s || "").trim().toLowerCase();

// Category photos: square PNG for the small circles.
const png = (id) =>
  `https://images.unsplash.com/${id}?fm=png&fit=crop&w=400&h=400&q=80`;

const CATEGORY_IMAGES = {
  "veg starters":  png("photo-1601050690597-df0568f70950"), // samosas
  "veg mains":     png("photo-1585937421612-70a008356fbe"), // curry in steel bowl
  "tandoori":      png("photo-1555939594-58d7cb561ad1"),    // grilled meat
  "chicken mains": png("photo-1772730064951-89b427965dbc"), // chicken tikka masala
  "thali":         png("photo-1625398407796-82650a8c135f"), // thali on banana leaf
  "fish fry":      png("photo-1786227905994-235e1799292e"), // Kerala fried fish meal
  "biryani":       png("photo-1631515243349-e0cb75fb8d3a"), // chicken biryani
  "pulao":         png("photo-1767114915989-c6ab3c8fc42e"), // rice bowls
  "breads":        png("photo-1600935926387-12d9b03066f0"), // roti / naan
  "beverages":     png("photo-1621330716555-5cad596c4562"), // iced lemon drink
};

// Dish photos (600px).
const img = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=80`;

const ITEM_IMAGES = {
  "veg thali":           img("photo-1625398407796-82650a8c135f"), // thali on banana leaf
  "standard fish thali": img("photo-1786227905994-235e1799292e"), // fried fish meal
  "kingfish thali":      img("photo-1786227905994-235e1799292e"), // fried fish meal
  "chonak thali":        img("photo-1786227905994-235e1799292e"), // fried fish meal
  "prawns thali":        img("photo-1723476669561-e0419f096039"), // cooked prawn plate
};

module.exports = async (req, res) => {
  try {
    const m = await getMenu();
    const categories = m.categories.map((c) =>
      CATEGORY_IMAGES[key(c.name)] ? { ...c, image: CATEGORY_IMAGES[key(c.name)] } : c
    );
    const items = m.items.map((i) =>
      ITEM_IMAGES[key(i.name)] ? { ...i, image: ITEM_IMAGES[key(i.name)] } : i
    );
    // Short CDN cache keeps Firestore reads low; owner edits show within ~20s.
    res.setHeader("Cache-Control", "public, s-maxage=20, stale-while-revalidate=60");
    res.status(200).json({ categories, items });
  } catch (e) { fail(res, e); }
};