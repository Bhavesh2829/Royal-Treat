/* ==========================================================================
   Royal Treat — QR Ordering System
   app.js · UI logic

   Flow:  QR scan (?table=5)  ->  browse menu  ->  cart  ->  order  ->  track
   Load order:  config.js -> menu-data.js -> api.js -> app.js

   This file only talks to the backend through Api.* and reads every rule
   (tax, limits, features) from APP_CONFIG. Nothing is hard-coded here
   except copy in UI_TEXT below.
   ========================================================================== */
(() => {
  "use strict";

  const cfg = window.APP_CONFIG;
  if (!cfg || typeof Api === "undefined") {
    document.body.innerHTML =
      '<p style="padding:2rem;font-family:sans-serif">Setup error: config.js and api.js must load before app.js.</p>';
    return;
  }

  /* ======================================================================
     Constants
     ====================================================================== */
  const UI_TEXT = {
    cardTagline: "Authentic Goan preparation",
    priceOnRequest: "Ask your server for today's price",
    askServer: "Ask server",
  };
  const CARD_CATEGORIES = new Set(["thali"]); // categories shown as large photo cards
  const STATUS_LABELS = {
    received: "Order received",
    preparing: "Being prepared",
    ready: "Ready to serve",
    served: "Served. Enjoy!",
    cancelled: "Cancelled",
  };
  const FINAL_STATUSES = new Set(["served", "cancelled"]);
  const STEP_ORDER = ["received", "preparing", "ready", "served"];
  const WAITER_COOLDOWN_MS = 60 * 1000;
  const STATUS_REFRESH_MS = 60 * 1000;
  const TTL_MS = cfg.CART_TTL_MINUTES * 60 * 1000;
  const money = cfg.helpers.formatPrice;
  const WAITER_MODE = (() => { try { return !!sessionStorage.getItem("rt-waiter"); } catch (_) { return false; } })();

  /* ======================================================================
     Tiny helpers
     ====================================================================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const on = (sel, evt, fn, opts) => { const el = $(sel); if (el) el.addEventListener(evt, fn, opts); };
  const setText = (sel, text) => { const el = $(sel); if (el) el.textContent = text; };
  const setHidden = (sel, hidden) => { const el = $(sel); if (el) el.classList.toggle("hidden", hidden); };

  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);

  const debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  /** Customer-safe message for any error. */
  const errMsg = (e) => e?.userMessage || "Something went wrong. Please try again.";

  /* ---------- storage (namespaced, with expiry) ---------- */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(cfg.helpers.storageKey(key));
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(cfg.helpers.storageKey(key), JSON.stringify(value)); } catch (_) {}
    },
    del(key) {
      try { localStorage.removeItem(cfg.helpers.storageKey(key)); } catch (_) {}
    },
    /** Value saved with setFresh() that is not older than CART_TTL_MINUTES. */
    getFresh(key) {
      const rec = this.get(key, null);
      if (!rec || typeof rec.at !== "number" || Date.now() - rec.at > TTL_MS) {
        if (rec) this.del(key);
        return null;
      }
      return rec.value;
    },
    setFresh(key, value) { this.set(key, { at: Date.now(), value }); },
  };

  function loadSavedCart() {
    const saved = store.getFresh("cart");
    const clean = {};
    if (saved && typeof saved === "object") {
      for (const [id, qty] of Object.entries(saved)) {
        const n = Math.floor(Number(qty));
        if (n > 0) clean[id] = Math.min(n, cfg.MAX_QTY_PER_ITEM);
      }
    }
    return clean;
  }

  /* ======================================================================
     State
     ====================================================================== */
  const state = {
    view: "tables",
    restaurant: { name: cfg.RESTAURANT_NAME, isOpen: true },
    tables: [],
    categories: [],
    items: [],
    table: WAITER_MODE ? null : store.getFresh("table"),   // { id, label }
    cart: loadSavedCart(),            // { itemId: qty }
    category: "all",
    search: "",
    vegOnly: false,
    order: null,                      // order just placed (confirmation screen)
    menuLoaded: false,
    placing: false,
  };

  const itemById = (id) => state.items.find((i) => i.id === String(id));
  const persistCart = () => store.setFresh("cart", state.cart);

  /* ======================================================================
     Views, toast, branding, features
     ====================================================================== */
  function show(view) {
    state.view = view;
    ["tables", "menu", "success"].forEach((v) => setHidden("#view-" + v, v !== view));
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    const inner = $("div", el);
    (inner || el).textContent = msg;
    el.classList.remove("opacity-0", "translate-y-4");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("opacity-0", "translate-y-4"), 2200);
  }

  function applyBranding() {
    setText("#brand-name", cfg.RESTAURANT_NAME);
    setText("#eyebrow", cfg.EYEBROW);
    setText("#headline-1", cfg.HEADLINE_1);
    setText("#headline-2", cfg.HEADLINE_2);
    setText("#subtext", cfg.SUBTEXT);
    setText("#powered-by", cfg.POWERED_BY);
    const logo = $("#brand-logo");
    if (logo && cfg.LOGO) logo.src = cfg.LOGO;
    document.title = `${cfg.RESTAURANT_NAME} · Digital Dining`;
    let meta = $('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = cfg.THEME_COLOR;
  }

  /** Elements marked data-feature="search" etc. follow APP_CONFIG.FEATURES. */
  function applyFeatures() {
    $$("[data-feature]").forEach((el) => {
      const key = el.dataset.feature.toUpperCase();
      if (key in cfg.FEATURES) el.classList.toggle("hidden", !cfg.FEATURES[key]);
    });
  }

  function applyLive() {
    const open = state.restaurant.isOpen;
    $$("#live-pill, #live-pill-2").forEach((pill) => {
      pill.className = pill.className
        .replace(/border-live\/20|border-amber-300\/50/g, open ? "border-live/20" : "border-amber-300/50")
        .replace(/bg-live-soft|bg-amber-50/g, open ? "bg-live-soft" : "bg-amber-50")
        .replace(/text-live|text-amber-700/g, open ? "text-live" : "text-amber-700");
      const dot = $(".live-dot", pill);
      if (dot) dot.className = `live-dot h-2 w-2 rounded-full ${open ? "bg-live" : "bg-amber-500"}`;
      const text = $(".live-text", pill);
      if (text) text.textContent = open ? "Menu is live" : "Orders paused";
    });
  }

  /** Blocking screen for problems the customer can't fix. */
  function showFatal(title, detail, retryId = "retry-init") {
    const grid = $("#table-grid");
    if (!grid) return;
    grid.innerHTML = `
      <div class="col-span-3 rounded-3xl bg-white p-8 text-center shadow-card">
        <p class="text-lg font-bold">${esc(title)}</p>
        <p class="mt-1 text-sm text-slate-500">${esc(detail)}</p>
        <button id="${retryId}" class="mt-5 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white">Retry</button>
      </div>`;
    on("#" + retryId, "click", () => location.reload());
  }

  /* ======================================================================
     Tables
     ====================================================================== */
  function renderTables() {
    setText("#table-count", `${state.tables.length} tables`);
    $("#table-grid").innerHTML = state.tables.map((t, i) => {
      const off = t.status === "disabled" || t.status === "unavailable";
      return `
      <button role="listitem" data-table="${esc(t.id)}" ${off ? "disabled" : ""}
        aria-label="${off ? "Table " + esc(t.label) + " unavailable" : "Choose table " + esc(t.label)}"
        style="animation-delay:${Math.min(i * 25, 400)}ms"
        class="table-card fade-up relative flex h-[104px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 disabled:opacity-40">
        <span class="absolute right-3.5 top-3.5 h-2.5 w-2.5 rounded-full ${off ? "bg-slate-300" : "bg-live"}"></span>
        <span class="text-2xl font-bold tracking-tight">${esc(t.label)}</span>
        <span class="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">${off ? "Unavailable" : "Choose table"}</span>
      </button>`;
    }).join("");
  }

  function skeletonTables() {
    $("#table-grid").innerHTML = Array.from({ length: 9 }, () => `<div class="skeleton h-[104px] rounded-2xl"></div>`).join("");
  }

  function selectTable(table) {
    // Changing table keeps the cart; it simply moves to the new table.
    state.table = { id: table.id, label: table.label };
    store.setFresh("table", state.table);
    enterMenu();
  }

  /** Accepts "5", "T5", "T05", "t05" and matches it to a real table. */
  function findTable(raw) {
    if (raw == null) return null;
    const v = String(raw).trim().toUpperCase();
    if (!v) return null;
    const digits = v.replace(/\D/g, "").replace(/^0+/, "");
    return state.tables.find((t) =>
      t.id.toUpperCase() === v ||
      t.label.toUpperCase() === v ||
      (digits && t.label.replace(/\D/g, "").replace(/^0+/, "") === digits)
    ) || null;
  }

  /* ======================================================================
     Menu
     ====================================================================== */
  async function loadMenu({ force = false } = {}) {
    renderItemSkeleton();
    try {
      const menu = await Api.getMenu({ force });
      state.categories = menu.categories;
      state.items = menu.items;
      state.menuLoaded = true;
      pruneCart();
      renderCategories();
      renderItems();
      updateCartBadge();
      if (menu.stale) toast("You're offline. Showing the last saved menu.");
    } catch (err) {
      $("#item-list").innerHTML = `
        <div class="rounded-3xl bg-white p-8 text-center shadow-card">
          <p class="text-lg font-bold">Couldn’t load the menu</p>
          <p class="mt-1 text-sm text-slate-500">${esc(errMsg(err))}</p>
          <button id="retry-menu" class="mt-5 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white">Try again</button>
        </div>`;
      on("#retry-menu", "click", () => loadMenu({ force: true }));
    }
  }

  function renderItemSkeleton() {
    $("#item-list").innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton h-[84px] rounded-[22px]"></div>`).join("");
  }

  function renderCategories() {
    const all = { id: "all", name: "All dishes", emoji: "🍽️", image: "" };

    $("#category-row").innerHTML = [all, ...state.categories].map((c) => {
      const active = c.id === state.category;
      const plate = c.image
        ? `<img src="${esc(c.image)}" alt="" data-emoji="${esc(c.emoji)}" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" loading="lazy" />`
        : `<span class="text-[22px] leading-none transition-transform duration-300 group-hover:scale-110">${esc(c.emoji)}</span>`;

      return `
      <button data-cat="${esc(c.id)}" aria-pressed="${active}"
        class="group flex w-[84px] shrink-0 snap-start flex-col items-center gap-2 rounded-2xl border px-1.5 pb-2.5 pt-1.5 transition-all ${
          active
            ? "border-brand-line bg-brand-soft shadow-sm"
            : "border-slate-200/60 bg-white shadow-[0_2px_8px_rgb(0,0,0,0.03)] hover:border-slate-300 active:scale-95"
        }">
        <div class="relative grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-full ${
          active ? "bg-white shadow-sm ring-1 ring-black/5" : "bg-slate-50 ring-1 ring-slate-200/50"
        }">${plate}</div>
        <span class="w-full text-center text-[11px] font-bold leading-[1.2] line-clamp-2 px-0.5 ${
          active ? "text-brand" : "text-slate-700 group-hover:text-slate-900"
        }">${esc(c.name)}</span>
      </button>`;
    }).join("");
  }

  function filteredItems() {
    const q = state.search.trim().toLowerCase();
    const catName = (id) => (state.categories.find((c) => c.id === id) || {}).name || "";
    return state.items.filter((i) =>
      (state.category === "all" || i.category === state.category) &&
      (!state.vegOnly || i.veg) &&
      (!q ||
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        catName(i.category).toLowerCase().includes(q))
    );
  }

  const vegMark = (veg) => `
    <div class="mt-[2px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] ${veg ? "border-green-600" : "border-red-600"}" title="${veg ? "Veg" : "Non-veg"}">
      <div class="h-1.5 w-1.5 rounded-full ${veg ? "bg-green-600" : "bg-red-600"}"></div>
    </div>`;

  const priceText = (item) => (item.priceOnRequest ? item.priceLabel : money(item.price));

  function actionHtml(item, isCard = false) {
    const qty = state.cart[item.id] || 0;
    const open = state.restaurant.isOpen;
    const id = esc(item.id);
    const label = esc(item.name);

    if (!item.available) {
      return `<span class="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Sold out</span>`;
    }
    if (item.priceOnRequest) {
      return `<span class="rounded-lg ${isCard ? "bg-white/90" : "bg-slate-100"} px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">${esc(UI_TEXT.askServer)}</span>`;
    }

    // Large photo cards
    if (isCard) {
      if (!qty) {
        return `<button data-act="add" data-id="${id}" aria-label="Add ${label}" ${open ? "" : "disabled"}
          class="add-btn flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl font-light text-black shadow-md transition hover:scale-105 active:scale-95 disabled:opacity-40" style="padding-bottom: 2px;">+</button>`;
      }
      return `
        <div class="flex items-center overflow-hidden rounded-full bg-white text-black shadow-md">
          <button data-act="dec" data-id="${id}" aria-label="Remove one ${label}" class="step-btn grid h-10 w-10 place-items-center text-xl font-medium hover:bg-slate-100">−</button>
          <span class="min-w-[1.25rem] text-center text-[15px] font-extrabold">${qty}</span>
          <button data-act="inc" data-id="${id}" aria-label="Add one ${label}" class="step-btn grid h-10 w-10 place-items-center text-xl font-medium hover:bg-slate-100">+</button>
        </div>`;
    }

    // Standard rows
    if (!qty) {
      return `<button data-act="add" data-id="${id}" aria-label="Add ${label}" ${open ? "" : "disabled"}
        class="add-btn shrink-0 rounded-lg border border-red-200/80 bg-red-50 px-4 py-2 text-[12px] font-extrabold uppercase tracking-wide text-brand transition hover:bg-red-100 disabled:opacity-40">ADD</button>`;
    }
    return `
      <div class="flex items-center overflow-hidden rounded-lg border border-brand bg-brand text-white shadow-sm">
        <button data-act="dec" data-id="${id}" class="step-btn grid h-8 w-8 place-items-center text-lg font-bold hover:bg-brand-dark" aria-label="Remove one ${label}">−</button>
        <span class="min-w-5 text-center text-[13px] font-extrabold">${qty}</span>
        <button data-act="inc" data-id="${id}" class="step-btn grid h-8 w-8 place-items-center text-lg font-bold hover:bg-brand-dark" aria-label="Add one ${label}">+</button>
      </div>`;
  }

  function cardHtml(item, i) {
    return `
      <article data-item="${esc(item.id)}" data-card="true" style="animation-delay:${Math.min(i * 30, 300)}ms"
        class="fade-up relative mb-4 overflow-hidden rounded-[24px] h-[280px] w-full shadow-[0_4px_12px_rgb(0,0,0,0.1)] group">
        ${item.image
          ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" class="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />`
          : `<div class="absolute inset-0 bg-slate-200"></div>`}
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent"></div>
        <div class="absolute left-4 top-4 rounded-md bg-white/95 p-1.5 shadow-sm">${vegMark(item.veg)}</div>
        <div class="absolute inset-x-0 bottom-0 flex flex-col p-5">
          <h4 class="text-[24px] font-extrabold leading-tight text-white drop-shadow-md">${esc(item.name)}</h4>
          <p class="mt-1.5 text-[13px] font-medium text-white/80 line-clamp-1">${esc(item.description || (item.priceOnRequest ? UI_TEXT.priceOnRequest : UI_TEXT.cardTagline))}</p>
          <div class="mt-4 flex items-center justify-between">
            <span class="text-[20px] font-extrabold tracking-tight text-white drop-shadow-md">${esc(priceText(item))}</span>
            <div class="item-action shrink-0">${actionHtml(item, true)}</div>
          </div>
        </div>
      </article>`;
  }

  function rowHtml(item, i) {
    const note = item.description || (item.priceOnRequest ? UI_TEXT.priceOnRequest : "");
    return `
      <article data-item="${esc(item.id)}" style="animation-delay:${Math.min(i * 30, 300)}ms"
        class="fade-up mb-2.5 group flex items-center justify-between gap-2.5 rounded-[14px] border border-slate-200/60 bg-white p-2.5 shadow-[0_2px_8px_rgb(0,0,0,0.03)] transition-all hover:border-slate-300">
        <div class="flex flex-1 min-w-0 items-start gap-2.5">
          ${vegMark(item.veg)}
          <div class="min-w-0 pr-1">
            <h4 class="text-[14px] font-bold leading-[1.3] text-slate-800">${esc(item.name)}</h4>
            ${note ? `<p class="mt-0.5 text-[11px] leading-snug text-slate-500">${esc(note)}</p>` : ""}
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-3">
          ${item.image ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" class="h-14 w-14 rounded-lg object-cover shadow-sm border border-slate-100" loading="lazy" />` : ""}
          <span class="text-[14px] font-extrabold tracking-tight text-slate-900">${esc(priceText(item))}</span>
          <div class="item-action shrink-0">${actionHtml(item, false)}</div>
        </div>
      </article>`;
  }

  function renderItems() {
    const list = filteredItems();
    const catName = state.category === "all" ? null : (state.categories.find((c) => c.id === state.category) || {}).name;
    const searching = state.search.trim().length > 0;

    setText("#list-title", searching ? "Search results" : catName || "Guest favourites");
    setText("#list-sub", searching ? `Showing matches for “${state.search.trim()}”.` : state.vegOnly ? "Vegetarian picks only." : "Fresh picks from our menu.");
    setText("#item-count", `${list.length} item${list.length === 1 ? "" : "s"}`);

    if (!list.length) {
      $("#item-list").innerHTML = `
        <div class="rounded-2xl bg-white p-6 text-center shadow-sm border border-slate-200/60">
          <p class="text-3xl">🔍</p>
          <p class="mt-2 text-base font-bold">No dishes found</p>
          <p class="mt-0.5 text-xs text-slate-500">Try a different search or clear the filters.</p>
          <button data-act="clear" class="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-bold active:scale-95 transition-transform">Clear filters</button>
        </div>`;
      return;
    }

    $("#item-list").innerHTML = list
      .map((item, i) => (CARD_CATEGORIES.has(item.category) ? cardHtml(item, i) : rowHtml(item, i)))
      .join("");
  }

  /** Update just one row's button instead of re-rendering the whole list. */
  function updateRow(id) {
    const item = itemById(id);
    const article = $(`[data-item="${CSS.escape(String(id))}"]`);
    const slot = article?.querySelector(".item-action");
    if (item && slot) slot.innerHTML = actionHtml(item, article.hasAttribute("data-card"));
  }

  /* ======================================================================
     Cart
     ====================================================================== */
  /** Drop anything that disappeared, sold out, or became non-orderable. */
  function pruneCart() {
    let changed = false;
    for (const id of Object.keys(state.cart)) {
      const it = itemById(id);
      if (!it || !it.orderable) { delete state.cart[id]; changed = true; }
    }
    if (changed) persistCart();
  }

  function cartLines() {
    return Object.entries(state.cart)
      .map(([id, qty]) => ({ item: itemById(id), qty }))
      .filter((l) => l.item && l.qty > 0);
  }

  function totals() {
    const lines = cartLines();
    const count = lines.reduce((n, l) => n + l.qty, 0);
    const raw = lines.reduce((n, l) => n + l.qty * l.item.price, 0);
    return { lines, count, ...cfg.helpers.calculateTotals(raw) };
  }

  const belowMinimum = (t) => cfg.MIN_ORDER_VALUE > 0 && t.count > 0 && t.subtotal < cfg.MIN_ORDER_VALUE;

  function changeQty(id, delta) {
    const item = itemById(id);
    if (!item || !item.orderable) return;
    if (delta > 0 && !state.restaurant.isOpen) return toast("Ordering is paused right now");

    const current = state.cart[id] || 0;
    if (delta > 0 && !current && Object.keys(state.cart).length >= cfg.MAX_ITEMS_PER_ORDER) {
      return toast(`You can order up to ${cfg.MAX_ITEMS_PER_ORDER} different items`);
    }
    const next = Math.max(0, Math.min(cfg.MAX_QTY_PER_ITEM, current + delta));
    if (delta > 0 && next === current) return toast(`Max ${cfg.MAX_QTY_PER_ITEM} per item`);

    if (next === 0) delete state.cart[id]; else state.cart[id] = next;
    persistCart();
    updateRow(id);
    updateCartBadge(true);
    if (isCartOpen()) renderCart();
  }

  function updateCartBadge(bump) {
    const b = $("#cart-badge");
    if (!b) return;
    b.textContent = totals().count;
    if (bump) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); }
  }

  /* ---------- cart drawer ---------- */
  const isCartOpen = () => !$("#cart-sheet").classList.contains("translate-y-full");

  function openCart() {
    renderCart();
    setHidden("#cart-error", true);
    const sheet = $("#cart-sheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.removeAttribute("inert"); // closed drawer is inert so Tab can't reach hidden buttons
    $("#cart-overlay").classList.remove("pointer-events-none", "opacity-0");
    sheet.classList.remove("pointer-events-none", "translate-y-full");
    document.body.style.overflow = "hidden";
    $("#close-cart")?.focus();
  }

  function closeCart() {
    $("#cart-overlay").classList.add("pointer-events-none", "opacity-0");
    $("#cart-sheet").classList.add("pointer-events-none", "translate-y-full");
    $("#cart-sheet").setAttribute("inert", "");
    document.body.style.overflow = "";
    $("#open-cart")?.focus();
  }

  /** Service-charge row is created on demand by cloning the GST row. */
  function ensureServiceRow() {
    let row = $("#c-svc-row");
    if (row) return row;
    const taxRow = $("#c-tax-row");
    if (!taxRow) return null;
    row = taxRow.cloneNode(true);
    row.id = "c-svc-row";
    const val = row.querySelector("#c-tax");
    if (val) val.id = "c-svc";
    taxRow.before(row);
    return row;
  }

  function renderCart() {
    const t = totals();
    setText("#cart-table", state.table ? `${state.table.label} · ${cfg.RESTAURANT_NAME}` : cfg.RESTAURANT_NAME);
    setText("#c-sub", money(t.subtotal));

    // GST row
    setText("#c-tax", money(t.tax));
    setHidden("#c-tax-row", !cfg.GST_PERCENT);
    const taxLabel = $("#c-tax-row span:first-child");
    if (taxLabel) taxLabel.textContent = `GST (${cfg.GST_PERCENT}%)${cfg.PRICES_INCLUDE_TAX ? " incl." : ""}`;

    // Optional service-charge row
    const hasService = cfg.SERVICE_CHARGE_PERCENT > 0;
    const svcRow = hasService ? ensureServiceRow() : $("#c-svc-row");
    if (svcRow) {
      svcRow.classList.toggle("hidden", !hasService);
      const l = svcRow.querySelector("span:first-child");
      if (l) l.textContent = `Service charge (${cfg.SERVICE_CHARGE_PERCENT}%)`;
      setText("#c-svc", money(t.service));
    }

    setText("#c-total", money(t.total));

    const open = state.restaurant.isOpen;
    const short = belowMinimum(t);
    const btn = $("#place-order");
    if (btn) btn.disabled = !t.count || state.placing || !open || short;
    setText(
      "#place-label",
      state.placing ? "Placing order…"
        : !open ? "Ordering paused"
        : short ? `Add ${money(cfg.MIN_ORDER_VALUE - t.subtotal)} more to order`
        : `Place order · ${money(t.total)}`
    );

    if (!t.count) {
      $("#cart-body").innerHTML = `
        <div class="py-14 text-center">
          <p class="text-5xl">🛒</p>
          <p class="mt-3 text-lg font-bold">Your cart is empty</p>
          <p class="mt-1 text-sm text-slate-500">Add a few dishes to get started.</p>
        </div>`;
      return;
    }

    const lines = t.lines.map(({ item, qty }) => `
      <li class="flex items-center gap-3 py-3.5">
        ${vegMark(item.veg)}
        <div class="min-w-0 flex-1">
          <p class="truncate text-[15px] font-bold">${esc(item.name)}</p>
          <p class="text-sm text-slate-500">${money(item.price)} × ${qty}</p>
        </div>
        <div class="flex items-center overflow-hidden rounded-xl border border-brand-line bg-brand-soft text-brand">
          <button data-act="dec" data-id="${esc(item.id)}" class="step-btn grid h-9 w-9 place-items-center text-lg font-bold" aria-label="Remove one ${esc(item.name)}">−</button>
          <span class="min-w-5 text-center text-sm font-extrabold">${qty}</span>
          <button data-act="inc" data-id="${esc(item.id)}" class="step-btn grid h-9 w-9 place-items-center text-lg font-bold" aria-label="Add one ${esc(item.name)}">+</button>
        </div>
        <span class="w-16 text-right text-[15px] font-extrabold">${money(item.price * qty)}</span>
      </li>`).join("");

    // Keep what the guest already typed when the drawer re-renders.
    const keep = { name: $("#f-name")?.value || "", phone: $("#f-phone")?.value || "", notes: $("#f-notes")?.value || "" };
    const inputCls = "rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10";

    $("#cart-body").innerHTML = `
      <ul class="divide-y divide-slate-100">${lines}</ul>
      <div class="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Optional details</p>
        <div class="grid grid-cols-2 gap-3">
          <input id="f-name" maxlength="60" autocomplete="name" placeholder="Your name" value="${esc(keep.name)}" class="${inputCls}" />
          <input id="f-phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="14" placeholder="Mobile (10 digits)" value="${esc(keep.phone)}" class="${inputCls}" />
        </div>
        ${cfg.FEATURES.ORDER_NOTES
          ? `<textarea id="f-notes" rows="2" maxlength="${cfg.NOTE_MAX_LENGTH}" placeholder="Cooking notes: less spicy, no onion…" class="w-full resize-none ${inputCls}">${esc(keep.notes)}</textarea>`
          : ""}
      </div>`;
  }

  function showCartError(msg) {
    const el = $("#cart-error");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  async function placeOrder() {
    if (state.placing) return;
    setHidden("#cart-error", true);

    const t = totals();
    if (!state.table) return showCartError("Please choose your table first.");
    if (!t.count) return showCartError("Your cart is empty.");

    state.placing = true;
    renderCart();
    try {
      // Api validates, recalculates totals, and de-duplicates double taps.
      const order = await Api.createOrder({
        table: state.table.id,
        items: t.lines.map((l) => ({ id: l.item.id, name: l.item.name, price: l.item.price, qty: l.qty })),
        customer: { name: $("#f-name")?.value || "", phone: $("#f-phone")?.value || "" },
        notes: $("#f-notes")?.value || "",
        paymentMethod: cfg.PAYMENT_METHODS[0],
      });

      state.order = {
        ...order,
        table: state.table.id,
        total: t.total,
        items: t.lines.map((l) => ({ name: l.item.name, price: l.item.price, qty: l.qty })),
      };
      store.setFresh("active-order", state.order); // survives a page refresh

      state.cart = {};
      store.del("cart");
      if (WAITER_MODE) store.del("table"); // next table must be picked again
      state.placing = false;
      closeCart();
      updateCartBadge();
      renderItems();
      showSuccess();
    } catch (e) {
      state.placing = false;
      renderCart();
      showCartError(errMsg(e));
    }
  }

  /* ======================================================================
     Order confirmation + live tracking
     ====================================================================== */
  let trackTimer = null;
  const stopTracking = () => { clearTimeout(trackTimer); trackTimer = null; };

  function showSuccess() {
    show("success");
    renderSuccess();
    startTracking();
  }

  function renderSteps(status, tracking) {
    const ol = $("#s-steps");
    if (!ol) return;
    const visible = tracking && status !== "cancelled";
    ol.classList.toggle("hidden", !visible);
    if (!visible) return;
    const current = Math.max(0, STEP_ORDER.indexOf(status));
    ol.innerHTML = STEP_ORDER.map((s, i) => {
      const done = i < current || (status === "served" && i === current);
      const active = i === current && status !== "served";
      const dot = done
        ? "bg-live text-white"
        : active ? "bg-brand text-white ring-4 ring-brand/15" : "bg-slate-100 text-slate-400";
      return `
        <li class="flex items-center gap-3 py-2" ${active ? 'aria-current="step"' : ""}>
          <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold ${dot}">${done ? "✓" : i + 1}</span>
          <span class="text-[15px] ${done || active ? "font-bold text-ink" : "font-medium text-slate-400"}">${esc(STATUS_LABELS[s])}</span>
        </li>`;
    }).join("");
  }

  /** Green "Track →" strip on the menu while an order is still in progress. */
  function renderBanner() {
    const o = state.order;
    const status = o?.status || "received";
    const live = !!o && cfg.FEATURES.ORDER_TRACKING && !FINAL_STATUSES.has(status);
    setHidden("#order-banner", !live);
    if (live) setText("#banner-text", `Order #${o.number ?? o.id} · ${STATUS_LABELS[status] || STATUS_LABELS.received}`);
  }

  function renderStatus() {
    const o = state.order;
    const status = o?.status || "received";
    const tracking = cfg.FEATURES.ORDER_TRACKING;

    setHidden("#s-status", !tracking);
    setText("#s-status", STATUS_LABELS[status] || STATUS_LABELS.received);
    setText(
      "#s-sub",
      !tracking ? "Your order is with the kitchen. Our team will bring it to your table."
        : status === "cancelled" ? "This order was cancelled. Please speak to our staff."
        : status === "served" ? "Enjoy your meal!"
        : "Sit back, we’re on it. Keep this page open to follow your order."
    );
    renderSteps(status, tracking);
    renderBanner();
  }

  function renderSuccess() {
    const o = state.order;
    if (!o) return;
    setText("#s-order", "#" + (o.number ?? o.id));
    setText("#s-table", (state.tables.find((t) => t.id === o.table) || {}).label || o.table);
    const list = $("#s-items");
    if (list) {
      list.innerHTML = (o.items || []).map((i) =>
        `<li class="flex justify-between gap-3 py-2.5"><span>${esc(i.name)} <span class="text-slate-400">× ${i.qty}</span></span><span class="font-bold">${money(i.price * i.qty)}</span></li>`
      ).join("");
    }
    setText("#s-total", money(o.total));
    renderStatus();
  }

  function startTracking() {
    stopTracking();
    if (!cfg.FEATURES.ORDER_TRACKING || !state.order) return;
    const orderId = state.order.id;

    const tick = async () => {
      if (state.order?.id !== orderId) return; // a newer order replaced this one: stop
      if (!document.hidden) {
        try {
          const r = await Api.getOrder(orderId);
          if (state.order?.id === orderId) {
            state.order.status = r.status;
            store.setFresh("active-order", state.order);
            renderStatus();
          }
          if (FINAL_STATUSES.has(r.status)) { store.del("active-order"); return; }
        } catch (_) { /* transient: try again next tick */ }
      }
      trackTimer = setTimeout(tick, cfg.ORDER_POLL_INTERVAL_MS);
    };
    trackTimer = setTimeout(tick, cfg.ORDER_POLL_INTERVAL_MS);
  }

  /* ======================================================================
     Optional features: repeat last order, call waiter
     ====================================================================== */

  let lastWaiterCall = 0;
  async function callWaiter() {
    if (!state.table) return toast("Please choose your table first");
    if (Date.now() - lastWaiterCall < WAITER_COOLDOWN_MS) return toast("Your waiter has been notified. Please wait a moment.");
    try {
      await Api.callWaiter({ table: state.table.id });
      lastWaiterCall = Date.now();
      toast("Waiter notified ✓");
    } catch (e) {
      toast(errMsg(e));
    }
  }

  /* ======================================================================
     Navigation + events
     ====================================================================== */
  function enterMenu() {
    setText("#table-label", /^T\d/i.test(state.table.label) ? `Table ${state.table.label.replace(/^T0*/i, "")}` : state.table.label);
    show("menu");
    updateCartBadge();
    renderBanner();
    if (!state.menuLoaded) loadMenu(); else { renderCategories(); renderItems(); }
  }

  function clearFilters() {
    state.search = ""; state.vegOnly = false; state.category = "all";
    const s = $("#search"); if (s) s.value = "";
    const v = $("#veg-only"); if (v) v.checked = false;
    renderCategories();
    renderItems();
  }

  function bindEvents() {
    // Choose a table
    on("#table-grid", "click", (e) => {
      const btn = e.target.closest("[data-table]");
      if (!btn) return;
      const t = state.tables.find((x) => x.id === btn.dataset.table);
      if (t) selectTable(t);
    });
    on("#change-table", "click", () => show("tables"));

    // Categories
    on("#category-row", "click", (e) => {
      const btn = e.target.closest("[data-cat]");
      if (!btn) return;
      state.category = btn.dataset.cat;
      renderCategories();
      renderItems();
    });

    // Item buttons (menu list and cart drawer share one handler)
    const handleAction = (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.disabled) return;
      const { act, id } = b.dataset;
      if (act === "add" || act === "inc") changeQty(id, 1);
      else if (act === "dec") changeQty(id, -1);
      else if (act === "clear") clearFilters();
    };
    on("#item-list", "click", handleAction);
    on("#cart-body", "click", handleAction);

    // Search + veg filter
    on("#search", "input", debounce((e) => { state.search = e.target.value; renderItems(); }, 150));
    on("#veg-only", "change", (e) => { state.vegOnly = e.target.checked; renderItems(); });

    // Cart
    on("#open-cart", "click", openCart);
    on("#close-cart", "click", closeCart);
    on("#cart-overlay", "click", closeCart);
    on("#place-order", "click", placeOrder);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isCartOpen()) closeCart(); });

    // Extras (only active if the matching button exists in index.html)
    on("#call-waiter", "click", callWaiter);
    on("#order-more", "click", () => { if (WAITER_MODE) { state.table = null; store.del("table"); show("tables"); } else enterMenu(); }); // tracking keeps running; the banner shows progress
    on("#order-banner", "click", () => { show("success"); renderSuccess(); });

    // A broken photo should never leave a hole in the layout.
    document.addEventListener("error", (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.dataset.emoji) {
        const span = document.createElement("span");
        span.className = "text-[22px] leading-none";
        span.textContent = img.dataset.emoji;
        img.replaceWith(span);
      } else {
        img.remove();
      }
    }, true);
  }

  /** While the page is open, pick up "open / paused" changes made by staff. */
  function watchRestaurantStatus() {
    if (cfg.USE_MOCK) return;
    setInterval(async () => {
      if (document.hidden) return;
      const r = await Api.getRestaurant();
      if (r.isOpen === state.restaurant.isOpen) return;
      state.restaurant = r;
      applyLive();
      if (state.view === "menu") renderItems();
      if (isCartOpen()) renderCart();
      toast(r.isOpen ? "Ordering is open again" : "Ordering is paused right now");
    }, STATUS_REFRESH_MS);
  }

  /* ======================================================================
     Boot
     ====================================================================== */
  async function init() {
    applyBranding();
    if (WAITER_MODE) setText("#eyebrow", "Waiter mode · taking an order");
    applyFeatures();
    bindEvents();
    skeletonTables();

    if (window.APP_CONFIG_ERRORS?.length) {
      console.error("[app] stopped because of config errors:", window.APP_CONFIG_ERRORS);
      showFatal("This menu isn't ready yet", "Please ask a member of staff for help.");
      return;
    }

    try {
      const [restaurant, tables] = await Promise.all([Api.getRestaurant(), Api.getTables()]);
      state.restaurant = restaurant;
      state.tables = tables;
    } catch (err) {
      showFatal("Can’t reach the restaurant right now", errMsg(err));
      return;
    }

    applyLive();
    renderTables();
    watchRestaurantStatus();

    // Came back (or refreshed) while an order is still in progress: resume tracking it.
    const active = store.getFresh("active-order");
    if (active && cfg.FEATURES.ORDER_TRACKING && !FINAL_STATUSES.has(active.status)) {
      state.order = active;
      startTracking();
    }

    // Priority: QR link (?table=) > remembered table > manual choice
    const rawQr = new URLSearchParams(location.search).get(cfg.TABLE_QUERY_PARAM);
    const qrTable = findTable(rawQr);
    const saved = state.table ? state.tables.find((t) => t.id === state.table.id) : null;

    if (qrTable) {
      selectTable(qrTable);
    } else if (saved) {
      state.table = { id: saved.id, label: saved.label };
      enterMenu();
    } else {
      show("tables");
      if (rawQr) toast("We couldn't read that table's QR code. Please choose your table.");
    }
  }

  init();
})();