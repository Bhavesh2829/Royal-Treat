/* ==========================================================================
   Royal Treat: demo menu
   Used only when APP_CONFIG.USE_MOCK = true. A real backend's GET /menu
   returns this exact shape: { categories: [...], items: [...] }

   HOW TO EDIT
   - Add an item: copy any line, give it a NEW unique id, and set category
     to one of the category ids listed under `categories`.
   - Hide an item temporarily: add  available: false
   - "Price on request" dishes: price: null, priceLabel: APS
     (shown on the menu, but not added to the cart).
   - Photos: use your own files, e.g. image: "images/butter-chicken.jpg".
     The stock photos below are placeholders and may not match the dish.
   - Never reuse or renumber ids. Saved carts and past orders refer to them.
   ========================================================================== */
(function () {
  "use strict";

  /* ---- Settings -------------------------------------------------------- */

  const APS = "APS";

  // "auto" = smallest modern format the browser supports (fast, recommended).
  // "png"  = lossless PNG (sharper edges, but noticeably heavier downloads).
  // "jpg"  = classic JPEG.
  const IMAGE_FORMAT = "auto";

  // "remote" = Unsplash stock photos (placeholders, may not match the dish).
  // "local"  = your own PNG files at images/categories/<category-id>.png
  //            e.g. images/categories/biryani.png  (recommended for production)
  const CATEGORY_IMAGE_SOURCE = "remote";
  const LOCAL_CATEGORY_DIR = "images/categories/";

  // Bump this whenever you edit the file. It forces browsers to re-download
  // the photos and is printed in the console so you can confirm which version
  // of this file is actually running.
  const MENU_VERSION = "2026-10-20.3";

  const CATEGORY_IMG_SIZE = 400; // shown as small circles, so no need for more
  const ITEM_IMG_SIZE = 600;

  /* ---- Helpers --------------------------------------------------------- */

  // Unsplash image builder: pass the photo id, get a sized, compressed URL.
  const photo = (id, width = 800) => {
    const format = IMAGE_FORMAT === "auto" ? "auto=format" : `fm=${IMAGE_FORMAT}`;
    return `https://images.unsplash.com/${id}?${format}&fit=crop&w=${width}&q=80`;
  };

  const categoryImage = (categoryId, photoId) =>
    CATEGORY_IMAGE_SOURCE === "local"
      ? `${LOCAL_CATEGORY_DIR}${categoryId}.png?v=${MENU_VERSION}`
      : `${photo(photoId, CATEGORY_IMG_SIZE)}&v=${MENU_VERSION}`;
  const itemPhoto = (id) => photo(id, ITEM_IMG_SIZE);

  const FISH_STYLES =
    "Choose your style: Rawa Fry, Recheado Masala, Batter-fried or Butter Garlic. Mention it in order notes.";

  /* ---- Menu data ------------------------------------------------------- */

  const menu = {
    /* ------------------------------------------------------------------ */
    categories: [
      { id: "soups",            name: "Soup",             emoji: "🍲", image: categoryImage("soups", "photo-1547592166-23ac45744acd") },
      { id: "veg-starters",     name: "Veg Starters",     emoji: "🥗", image: categoryImage("veg-starters", "photo-1567188040759-fb8a883dc6d8") },
      { id: "chicken-starters", name: "Chicken Starters", emoji: "🍗", image: categoryImage("chicken-starters", "photo-1610057099443-fde8c4d50f91") },
      { id: "veg-mains",        name: "Veg Mains",        emoji: "🍛", image: categoryImage("veg-mains", "photo-1631452180519-c014fe946bc7") },
      { id: "tandoori",         name: "Tandoori",         emoji: "🔥", image: categoryImage("tandoori", "photo-1555939594-58d7cb561ad1") },
      { id: "chicken-mains",    name: "Chicken Mains",    emoji: "🍗", image: categoryImage("chicken-mains", "photo-1772730064951-89b427965dbc") },
      { id: "thali",            name: "Thali",            emoji: "🍽️", image: categoryImage("thali", "photo-1625398407796-82650a8c135f") },
      { id: "fish-fry",         name: "Fish Fry",         emoji: "🐟", image: categoryImage("fish-fry", "photo-1786227905994-235e1799292e") },
      { id: "chinese-rice",     name: "Chinese Rice",     emoji: "🍚", image: categoryImage("chinese-rice", "photo-1603133872878-684f208fb84b") },
      { id: "noodles",          name: "Noodles",          emoji: "🍜", image: categoryImage("noodles", "photo-1569718212165-3a8278d5f624") },
      { id: "biryani",          name: "Biryani",          emoji: "🍲", image: categoryImage("biryani", "photo-1631515243349-e0cb75fb8d3a") },
      { id: "pulao",            name: "Pulao",            emoji: "🍚", image: categoryImage("pulao", "photo-1767114915989-c6ab3c8fc42e") },
      { id: "bread",            name: "Breads",           emoji: "🫓", image: categoryImage("bread", "photo-1600935926387-12d9b03066f0") },
      { id: "beverages",        name: "Beverages",        emoji: "🥤", image: categoryImage("beverages", "photo-1621330716555-5cad596c4562") },
      { id: "dessert",          name: "Dessert",          emoji: "🍮", image: categoryImage("dessert", "photo-1666190092159-3171cf0fbb12") },
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
      { id: 7,  category: "veg-starters", name: "French Fries",                 price: 150, veg: true },
      { id: 8,  category: "veg-starters", name: "Masala Papad",                 price: 130, veg: true },
      { id: 9,  category: "veg-starters", name: "Gobi Manchurian",              price: 190, veg: true },
      { id: 10, category: "veg-starters", name: "Mushroom Chilli",              price: 220, veg: true },
      { id: 11, category: "veg-starters", name: "Honey Chilli Potato",          price: 230, veg: true },
      { id: 12, category: "veg-starters", name: "Veg Tossed in Schezwan Sauce", price: 200, veg: true },
      { id: 13, category: "veg-starters", name: "Paneer 65",                    price: 250, veg: true },
      { id: 14, category: "veg-starters", name: "Paneer Tikka Kabab",           price: 260, veg: true },

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
      { id: 37, category: "tandoori", name: "Chicken Tikka Kabab",     price: 280, veg: false },
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
      { id: 48, category: "thali", name: "Veg Thali",           price: 160, veg: true,  image: itemPhoto("photo-1626776876729-bab4369a5a5a") },
      { id: 49, category: "thali", name: "Standard Fish Thali", price: 170, veg: false, image: itemPhoto("photo-1546833999-b9f581a1996d") },
      { id: 50, category: "thali", name: "Kingfish Thali",      price: null, priceLabel: APS, veg: false, image: itemPhoto("photo-1621334997871-3315750ee33a") },
      { id: 51, category: "thali", name: "Chonak Thali",        price: null, priceLabel: APS, veg: false, image: itemPhoto("photo-1786227905994-235e1799292e") },
      { id: 52, category: "thali", name: "Prawns Thali",        price: null, priceLabel: APS, veg: false, image: itemPhoto("photo-1565557623262-b51c2513a641") },

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
      { id: 75, category: "bread", name: "Pao",                price: 15,  veg: true },
      { id: 76, category: "bread", name: "Poi",                price: 15,  veg: true },
      { id: 77, category: "bread", name: "Chapati",            price: 30,  veg: true },
      { id: 78, category: "bread", name: "Roti",               price: 30,  veg: true },
      { id: 79, category: "bread", name: "Naan",               price: 60,  veg: true },
      { id: 80, category: "bread", name: "Butter Naan",        price: 80,  veg: true },
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

  /* ---- Self-check: catches typos the moment the page loads -------------- */
  (function validate() {
    const problems = [];
    const warnings = [];

    const categoryIds = new Set();
    menu.categories.forEach((c) => {
      if (categoryIds.has(c.id)) problems.push(`duplicate category id "${c.id}"`);
      categoryIds.add(c.id);
      if (!c.name) problems.push(`category "${c.id}" has no name`);
      if (!c.image) warnings.push(`category "${c.id}" has no image`);
    });

    const itemIds = new Set();
    menu.items.forEach((i) => {
      const label = `item ${i.id} "${i.name}"`;
      if (itemIds.has(i.id)) problems.push(`duplicate ${label}`);
      itemIds.add(i.id);
      if (!categoryIds.has(i.category)) problems.push(`${label} has unknown category "${i.category}"`);
      if (typeof i.veg !== "boolean") problems.push(`${label} needs veg: true or false`);
      if (i.price === null) {
        if (!i.priceLabel) problems.push(`${label} has no price and no priceLabel`);
      } else if (typeof i.price !== "number" || !(i.price >= 0)) {
        problems.push(`${label} has an invalid price (${i.price})`);
      }
    });

    categoryIds.forEach((id) => {
      if (!menu.items.some((i) => i.category === id)) warnings.push(`category "${id}" has no items`);
    });

    problems.forEach((p) => console.error(`[menu] ${p}`));
    warnings.forEach((w) => console.warn(`[menu] ${w}`));
  })();

  console.info(`[menu] Royal Treat mock menu v${MENU_VERSION} loaded (${CATEGORY_IMAGE_SOURCE} images)`);

  window.MOCK_MENU = menu;
})();