/* ==========================================================================
   Royal Treat — demo menu
   Used only when APP_CONFIG.USE_MOCK = true. A real backend's GET /menu
   returns this exact shape.

   HOW TO EDIT
   • Add an item: copy any line, give it a NEW unique id, set category to a
     category id from the list below.
   • Hide an item temporarily: add  available: false
   • "Price on request" dishes: price: null, priceLabel: APS
     (shown on the menu, but not added to the cart)
   • Photos: use your own files, e.g. image: "images/butter-chicken.jpg".
     Stock photos below are placeholders and may not match the dish.
   • Never reuse or renumber ids. Saved carts and past orders refer to them.
   ========================================================================== */
(function () {
  "use strict";

  const APS = "APS";

  // Unsplash image builder: pass the photo id, get a sized, compressed URL.
  const photo = (id, width = 800) =>
    `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;

  // Category circles: square-cropped PNG, 400px is plenty for a small circle.
  const categoryPhoto = (id) =>
    `https://images.unsplash.com/${id}?fm=png&fit=crop&w=400&h=400&q=80`;

  const FISH_STYLES = "Choose your style: Rawa Fry, Recheado Masala, Batter-fried or Butter Garlic. Mention it in order notes.";

  const menu = {
    /* ------------------------------------------------------------------ */
categories: [
  { id: "soups",            name: "Soup",             emoji: "🍲", image: categoryPhoto("photo-1547592166-23ac45744acd") },
  { id: "veg-starters",     name: "Veg Starters",     emoji: "🥗", image: categoryPhoto("photo-1601050690597-df0568f70950") }, // samosas
  { id: "chicken-starters", name: "Chicken Starters", emoji: "🍗", image: categoryPhoto("photo-1604908176997-125f25cc6f3d") },
  { id: "veg-mains",        name: "Veg Mains",        emoji: "🍛", image: categoryPhoto("photo-1585937421612-70a008356fbe") }, // curry in steel bowl
  { id: "tandoori",         name: "Tandoori",         emoji: "🔥", image: categoryPhoto("photo-1555939594-58d7cb561ad1") }, // grilled meat
  { id: "chicken-mains",    name: "Chicken Mains",    emoji: "🍗", image: categoryPhoto("photo-1772730064951-89b427965dbc") }, // chicken tikka masala
  { id: "thali",            name: "Thali",            emoji: "🍽️", image: categoryPhoto("photo-1625398407796-82650a8c135f") }, // thali on banana leaf
  { id: "fish-fry",         name: "Fish Fry",         emoji: "🐟", image: categoryPhoto("photo-1786227905994-235e1799292e") }, // Kerala fried fish meal
  { id: "chinese-rice",     name: "Chinese Rice",     emoji: "🍚", image: categoryPhoto("photo-1603133872878-684f208fb84b") },
  { id: "noodles",          name: "Noodles",          emoji: "🍜", image: categoryPhoto("photo-1569718212165-3a8278d5f624") },
  { id: "biryani",          name: "Biryani",          emoji: "🍲", image: categoryPhoto("photo-1631515243349-e0cb75fb8d3a") }, // chicken biryani
  { id: "pulao",            name: "Pulao",            emoji: "🍚", image: categoryPhoto("photo-1767114915989-c6ab3c8fc42e") }, // rice bowls
  { id: "bread",            name: "Breads",           emoji: "🫓", image: categoryPhoto("photo-1600935926387-12d9b03066f0") }, // roti / naan
  { id: "beverages",        name: "Beverages",        emoji: "🥤", image: categoryPhoto("photo-1621330716555-5cad596c4562") }, // iced lemon drink
  { id: "dessert",          name: "Dessert",          emoji: "🍮", image: categoryPhoto("photo-1488477181946-6428a0291777") },
],
    /* ------------------------------------------------------------------ */
    items: [
      // ---- Soup ---------------------------------------------------------
      { id: 1,  category: "soups", name: "Manchow Soup (Vegetable)",   price: 130, veg: true  },
      { id: 2,  category: "soups", name: "Manchow Soup (Chicken)",     price: 150, veg: false },
      { id: 3,  category: "soups", name: "Sweetcorn Soup (Vegetable)", price: 150, veg: true  },
      { id: 4,  category: "soups", name: "Sweetcorn Soup (Chicken)",   price: 170, veg: false },
      { id: 5,  category: "soups", name: "Cream Soup (Vegetable)",     price: 160, veg: true  },
      { id: 6,  category: "soups", name: "Cream Soup (Chicken)",       price: 180, veg: false },

      // ---- Veg Starters -------------------------------------------------
      { id: 7,  category: "veg-starters", name: "French Fries",                price: 150, veg: true },
      { id: 8,  category: "veg-starters", name: "Masala Papad",                price: 130, veg: true },
      { id: 9,  category: "veg-starters", name: "Gobi Manchurian",             price: 190, veg: true },
      { id: 10, category: "veg-starters", name: "Mushroom Chilli",             price: 220, veg: true },
      { id: 11, category: "veg-starters", name: "Honey Chilli Potato",         price: 230, veg: true },
      { id: 12, category: "veg-starters", name: "Veg Tossed in Schezwan Sauce", price: 200, veg: true },
      { id: 13, category: "veg-starters", name: "Paneer 65",                   price: 250, veg: true },
      { id: 14, category: "veg-starters", name: "Paneer Tikka Kabab",          price: 260, veg: true },

      // ---- Chicken Starters ---------------------------------------------
      { id: 15, category: "chicken-starters", name: "Chicken Dragon",             price: 260, veg: false },
      { id: 16, category: "chicken-starters", name: "Chicken Garlic Pepper",      price: 270, veg: false },
      { id: 17, category: "chicken-starters", name: "Chicken Lemon Grill",        price: 270, veg: false },
      { id: 18, category: "chicken-starters", name: "Chicken Coriander",          price: 260, veg: false },
      { id: 19, category: "chicken-starters", name: "Chicken Lollipop",           price: 230, veg: false },
      { id: 20, category: "chicken-starters", name: "Chicken 65",                 price: 250, veg: false },
      { id: 21, category: "chicken-starters", name: "Chicken Manchurian",         price: 250, veg: false },
      { id: 22, category: "chicken-starters", name: "Chicken Tossed in Schezwan", price: 250, veg: false },
      { id: 23, category: "chicken-starters", name: "Chicken Tawa Fry",           price: 280, veg: false },
      { id: 24, category: "chicken-starters", name: "Chicken Rawa Fry",           price: 290, veg: false },

      // ---- Veg Mains ----------------------------------------------------
      { id: 25, category: "veg-mains", name: "Dal Fry",             price: 180, veg: true },
      { id: 26, category: "veg-mains", name: "Dal Makhani",         price: 220, veg: true },
      { id: 27, category: "veg-mains", name: "Mixed Veg",           price: 230, veg: true },
      { id: 28, category: "veg-mains", name: "Aloo Gobi",           price: 220, veg: true },
      { id: 29, category: "veg-mains", name: "Veg Kadai",           price: 230, veg: true },
      { id: 30, category: "veg-mains", name: "Mushroom Xacuti",     price: 230, veg: true },
      { id: 31, category: "veg-mains", name: "Mutter Paneer",       price: 230, veg: true },
      { id: 32, category: "veg-mains", name: "Palak Paneer",        price: 240, veg: true },
      { id: 33, category: "veg-mains", name: "Paneer Makhani",      price: 250, veg: true },
      { id: 34, category: "veg-mains", name: "Paneer Tikka Masala", price: 280, veg: true },
      { id: 35, category: "veg-mains", name: "Paneer Kadai",        price: 240, veg: true },
      { id: 36, category: "veg-mains", name: "Paneer Chilli Fry",   price: 240, veg: true },

      // ---- Tandoori -----------------------------------------------------
      { id: 37, category: "tandoori", name: "Chicken Tikka Kabab",    price: 280, veg: false },
      { id: 38, category: "tandoori", name: "Chicken Tandoori (Half)", price: 250, veg: false },
      { id: 39, category: "tandoori", name: "Chicken Tandoori (Full)", price: 480, veg: false },

      // ---- Chicken Mains ------------------------------------------------
      { id: 40, category: "chicken-mains", name: "Chicken Xacuti",       price: 260, veg: false },
      { id: 41, category: "chicken-mains", name: "Chicken Cafreal",      price: 260, veg: false },
      { id: 42, category: "chicken-mains", name: "Chicken Masala",       price: 250, veg: false },
      { id: 43, category: "chicken-mains", name: "Chicken Kadai",        price: 270, veg: false },
      { id: 44, category: "chicken-mains", name: "Chicken Sukha",        price: 280, veg: false },
      { id: 45, category: "chicken-mains", name: "Chicken Tikka Masala", price: 300, veg: false },
      { id: 46, category: "chicken-mains", name: "Butter Chicken",       price: 280, veg: false },
      { id: 47, category: "chicken-mains", name: "Chicken Mughlai",      price: 280, veg: false },

      // ---- Thali --------------------------------------------------------
      { id: 48, category: "thali", name: "Veg Thali",           price: 160, veg: true,  image: photo("photo-1625398407796-82650a8c135f", 600) }, // South Indian thali on banana leaf
      { id: 49, category: "thali", name: "Standard Fish Thali", price: 170, veg: false, image: photo("photo-1786227905994-235e1799292e", 600) }, // fried fish meal
      { id: 50, category: "thali", name: "Kingfish Thali",      price: null, priceLabel: APS, veg: false, image: photo("photo-1621334997871-3315750ee33a", 600) },
      { id: 51, category: "thali", name: "Chonak Thali",        price: null, priceLabel: APS, veg: false, image: photo("photo-1786227905994-235e1799292e", 600) }, // fried fish meal
      { id: 52, category: "thali", name: "Prawns Thali",        price: null, priceLabel: APS, veg: false, image: photo("photo-1723476669561-e0419f096039", 600) }, // cooked prawn plate
      
      // ---- Fish Fry (all priced on request) -----------------------------
      { id: 53, category: "fish-fry", name: "Kingfish Fry",   price: null, priceLabel: APS, veg: false, description: FISH_STYLES },
      { id: 54, category: "fish-fry", name: "Chonak Fry",     price: null, priceLabel: APS, veg: false, description: FISH_STYLES },
      { id: 55, category: "fish-fry", name: "Prawns Fry",     price: null, priceLabel: APS, veg: false, description: FISH_STYLES },
      { id: 56, category: "fish-fry", name: "Pomfret Fry",    price: null, priceLabel: APS, veg: false, description: FISH_STYLES },
      { id: 57, category: "fish-fry", name: "Mackerel Fry",   price: null, priceLabel: APS, veg: false, description: FISH_STYLES },
      { id: 58, category: "fish-fry", name: "Squid Fry",      price: null, priceLabel: APS, veg: false, description: FISH_STYLES },
      { id: 59, category: "fish-fry", name: "Mussels Fry",    price: null, priceLabel: APS, veg: false, description: FISH_STYLES },
      { id: 60, category: "fish-fry", name: "Silverfish Fry", price: null, priceLabel: APS, veg: false, description: FISH_STYLES },
      { id: 61, category: "fish-fry", name: "Leppo Fry",      price: null, priceLabel: APS, veg: false, description: FISH_STYLES },

      // ---- Chinese Rice -------------------------------------------------
      { id: 62, category: "chinese-rice", name: "Veg Fried Rice",               price: 170, veg: true  },
      { id: 63, category: "chinese-rice", name: "Chicken Fried Rice",           price: 200, veg: false },
      { id: 64, category: "chinese-rice", name: "Mixed Fried Rice",             price: 249, veg: false },
      { id: 65, category: "chinese-rice", name: "Chicken Triple Schezwan Rice", price: 260, veg: false },

      // ---- Noodles ------------------------------------------------------
      { id: 66, category: "noodles", name: "Veg Hakka Noodles",     price: 180, veg: true  },
      { id: 67, category: "noodles", name: "Chicken Hakka Noodles", price: 200, veg: false },
      { id: 68, category: "noodles", name: "Mixed Hakka Noodles",   price: 250, veg: false },

      // ---- Biryani ------------------------------------------------------
      { id: 69, category: "biryani", name: "Veg Biryani",     price: 190, veg: true  },
      { id: 70, category: "biryani", name: "Chicken Biryani", price: 210, veg: false },
      { id: 71, category: "biryani", name: "Prawns Biryani",  price: null, priceLabel: APS, veg: false },

      // ---- Pulao --------------------------------------------------------
      { id: 72, category: "pulao", name: "Veg Pulao",    price: 180, veg: true  },
      { id: 73, category: "pulao", name: "Paneer Pulao", price: 250, veg: true  },
      { id: 74, category: "pulao", name: "Prawns Pulao", price: 400, veg: false },

      // ---- Breads -------------------------------------------------------
      { id: 75, category: "bread", name: "Pao",               price: 15,  veg: true },
      { id: 76, category: "bread", name: "Poi",               price: 15,  veg: true },
      { id: 77, category: "bread", name: "Chapati",           price: 30,  veg: true },
      { id: 78, category: "bread", name: "Roti",              price: 30,  veg: true },
      { id: 79, category: "bread", name: "Naan",              price: 60,  veg: true },
      { id: 80, category: "bread", name: "Butter Naan",       price: 80,  veg: true },
      { id: 81, category: "bread", name: "Butter Garlic Naan", price: 110, veg: true },
      { id: 82, category: "bread", name: "Cheese Garlic Naan", price: 160, veg: true },

      // ---- Beverages ----------------------------------------------------
      { id: 83, category: "beverages", name: "Mojito",        price: 150, veg: true },
      { id: 84, category: "beverages", name: "Blue Lagoon",   price: 150, veg: true },
      { id: 85, category: "beverages", name: "Kokum Fizz",    price: 150, veg: true },
      { id: 86, category: "beverages", name: "Lime Soda",     price: 60,  veg: true },
      { id: 87, category: "beverages", name: "Lime Water",    price: 60,  veg: true },
      { id: 88, category: "beverages", name: "Soft Drink",    price: 50,  veg: true },
      { id: 89, category: "beverages", name: "Mineral Water", price: 20,  veg: true },

      // ---- Dessert ------------------------------------------------------
      { id: 90, category: "dessert", name: "Gulab Jamun", price: 70,  veg: true },
      { id: 91, category: "dessert", name: "Serradura",   price: 150, veg: true },
    ],
  };

  /* ---- Self-check: catches typos the moment the page loads ------------- */
  (function validate() {
    const cats = new Set();
    menu.categories.forEach((c) => {
      if (cats.has(c.id)) console.error(`[menu] duplicate category id "${c.id}"`);
      cats.add(c.id);
    });

    const ids = new Set();
    menu.items.forEach((i) => {
      if (ids.has(i.id)) console.error(`[menu] duplicate item id ${i.id} ("${i.name}")`);
      ids.add(i.id);
      if (!cats.has(i.category)) console.error(`[menu] item ${i.id} "${i.name}" has unknown category "${i.category}"`);
      if (i.price === null && !i.priceLabel) console.error(`[menu] item ${i.id} "${i.name}" has no price and no priceLabel`);
    });

    cats.forEach((id) => {
      if (!menu.items.some((i) => i.category === id)) console.warn(`[menu] category "${id}" has no items`);
    });
  })();

  window.MOCK_MENU = menu;
})();