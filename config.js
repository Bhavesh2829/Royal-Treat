/* ==========================================================================
   Royal Treat — QR Ordering System
   config.js · single source of truth for branding, ordering rules & backend

   Edit values in the "SETTINGS" block only. Everything below it validates
   and freezes the config so a typo can never silently break ordering.
   All original keys are preserved, so existing files keep working.
   ========================================================================== */
(function () {
  "use strict";

  /* ======================================================================
     SETTINGS — the only part you need to edit
     ====================================================================== */
  const SETTINGS = {
    /* ---- Branding ------------------------------------------------------ */
    RESTAURANT_ID: "royal-treat", // unique slug, sent to backend
    RESTAURANT_NAME: "Royal Treat",
    EYEBROW: "A better way to dine",
    HEADLINE_1: "Good food,",
    HEADLINE_2: "great moments.",
    SUBTEXT:
      "Explore our kitchen favourites, find something you love, and build your order right from your table.",
    POWERED_BY: "Webtizo",
    LOGO: "royal-treat-logo.png",
    THEME_COLOR: "#0f1020", // browser address-bar colour on mobile

    /* ---- Ordering rules ------------------------------------------------ */
    CURRENCY: "₹",
    LOCALE: "en-IN", // number formatting, e.g. 1,25,000
    TABLE_COUNT: 18, // used by mock mode; real mode reads /tables
    TABLE_PREFIX: "T",
    TABLE_QUERY_PARAM: "table", // QR link format: index.html?table=T5
    GST_PERCENT: 5, // set 0 to hide the tax line
    SERVICE_CHARGE_PERCENT: 0, // optional; 0 = off
    MIN_ORDER_VALUE: 0, // 0 = no minimum
    MAX_QTY_PER_ITEM: 20,
    MAX_ITEMS_PER_ORDER: 50,
    NOTE_MAX_LENGTH: 200, // special instructions / allergy note
    PRICES_INCLUDE_TAX: false, // true if menu prices already include GST

    /* ---- Features (toggle without touching code) ----------------------- */
    FEATURES: {
      SEARCH: true,
      VEG_FILTER: true,
      ORDER_NOTES: true,
      CALL_WAITER: false, // needs POST /waiter-calls on backend
      ORDER_TRACKING: false, // needs GET /orders/:id on backend
    },

    /* ---- Payment ------------------------------------------------------- */
    // "counter" = pay at table/counter, "upi" = UPI intent link
    PAYMENT_METHODS: ["counter"],
    UPI_ID: "", // e.g. "royaltreat@upi" (only if "upi" enabled)

    /* ---- Backend ------------------------------------------------------- */
    // true  = runs fully in the browser (localStorage) for demo / design review
    // false = talks to your REST API at API_BASE_URL
    USE_MOCK: false,
    API_BASE_URL: "/api",
   API_HEADERS: {
      // Only PUBLIC keys belong here. Never put secrets in front-end code.
      // "Authorization": "Bearer <public-key>",
      // "X-Restaurant-Id": "royal-treat",
    },
    REQUEST_TIMEOUT_MS: 12000,
    RETRY_ATTEMPTS: 2, // extra tries on network/5xx errors
    RETRY_DELAY_MS: 800, // grows each retry (800, 1600, ...)
    ORDER_POLL_INTERVAL_MS: 8000, // used only if ORDER_TRACKING is on

    // Endpoint paths, relative to API_BASE_URL. Change if your API differs.
    ENDPOINTS: {
      RESTAURANT: "/restaurant",
      MENU: "/menu",
      TABLES: "/tables",
      ORDERS: "/orders", // POST create, GET /orders/:id
      WAITER_CALLS: "/waiter-calls",
    },

    /* ---- Storage ------------------------------------------------------- */
    STORAGE_PREFIX: "royaltreat:v1:", // bump v1 -> v2 to reset all saved carts
    CART_TTL_MINUTES: 180, // saved cart expires after 3 hours
  };

  /* ======================================================================
     VALIDATION — do not edit below this line
     ====================================================================== */
  const errors = [];
  const warnings = [];

  const isStr = (v) => typeof v === "string" && v.trim().length > 0;
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);

  const requireString = (key) => {
    if (!isStr(SETTINGS[key]))
      errors.push(`${key} must be a non-empty string.`);
  };
  const requireNumber = (key, min, max) => {
    const v = SETTINGS[key];
    if (!isNum(v) || v < min || (max !== undefined && v > max)) {
      errors.push(
        `${key} must be a number between ${min} and ${max === undefined ? "∞" : max}.`,
      );
    }
  };

  [
    "RESTAURANT_ID",
    "RESTAURANT_NAME",
    "CURRENCY",
    "LOCALE",
    "TABLE_PREFIX",
    "TABLE_QUERY_PARAM",
    "STORAGE_PREFIX",
  ].forEach(requireString);

  requireNumber("TABLE_COUNT", 1, 500);
  requireNumber("GST_PERCENT", 0, 100);
  requireNumber("SERVICE_CHARGE_PERCENT", 0, 100);
  requireNumber("MIN_ORDER_VALUE", 0);
  requireNumber("MAX_QTY_PER_ITEM", 1, 99);
  requireNumber("MAX_ITEMS_PER_ORDER", 1, 500);
  requireNumber("NOTE_MAX_LENGTH", 0, 1000);
  requireNumber("REQUEST_TIMEOUT_MS", 1000, 120000);
  requireNumber("RETRY_ATTEMPTS", 0, 5);
  requireNumber("RETRY_DELAY_MS", 0, 10000);
  requireNumber("ORDER_POLL_INTERVAL_MS", 2000);
  requireNumber("CART_TTL_MINUTES", 1);

  // Locale must be understood by the browser's Intl API.
  try {
    new Intl.NumberFormat(SETTINGS.LOCALE);
  } catch (_) {
    warnings.push(
      `LOCALE "${SETTINGS.LOCALE}" is not supported; falling back to "en-IN".`,
    );
    SETTINGS.LOCALE = "en-IN";
  }

  // Normalise the API base URL (strip trailing slashes) and sanity-check it.
  SETTINGS.API_BASE_URL = String(SETTINGS.API_BASE_URL || "").replace(
    /\/+$/,
    "",
  );

  if (!SETTINGS.USE_MOCK) {
   if (!/^(https?:\/\/|\/)/i.test(SETTINGS.API_BASE_URL)) {
      errors.push(
        "API_BASE_URL must start with http:// or https:// when USE_MOCK is false.",
      );
    } else if (/your-api\.example\.com/i.test(SETTINGS.API_BASE_URL)) {
      errors.push(
        "API_BASE_URL is still the placeholder. Set your real backend URL.",
      );
    } else if (
      location.protocol === "https:" &&
      /^http:\/\//i.test(SETTINGS.API_BASE_URL)
    ) {
      errors.push(
        "API_BASE_URL uses http:// but this page is https://; browsers will block it.",
      );
    }
  }

  // Payment sanity.
  const allowedPayments = ["counter", "upi"];
  SETTINGS.PAYMENT_METHODS = (SETTINGS.PAYMENT_METHODS || []).filter((m) =>
    allowedPayments.includes(m),
  );
  if (SETTINGS.PAYMENT_METHODS.length === 0)
    SETTINGS.PAYMENT_METHODS = ["counter"];
  if (
    SETTINGS.PAYMENT_METHODS.includes("upi") &&
    !/^[\w.\-]+@[\w.\-]+$/.test(SETTINGS.UPI_ID)
  ) {
    warnings.push(
      "UPI payment is enabled but UPI_ID looks invalid; UPI has been disabled.",
    );
    SETTINGS.PAYMENT_METHODS = SETTINGS.PAYMENT_METHODS.filter(
      (m) => m !== "upi",
    );
    if (SETTINGS.PAYMENT_METHODS.length === 0)
      SETTINGS.PAYMENT_METHODS = ["counter"];
  }

  // Warn if someone pastes a secret into front-end headers.
  Object.keys(SETTINGS.API_HEADERS || {}).forEach((h) => {
    if (
      /secret|private/i.test(h) ||
      /secret|private/i.test(String(SETTINGS.API_HEADERS[h]))
    ) {
      warnings.push(
        `API_HEADERS "${h}" looks like a secret. Front-end code is public.`,
      );
    }
  });

  /* ======================================================================
     HELPERS — shared by every file
     ====================================================================== */
  const currencyFormatter = new Intl.NumberFormat(SETTINGS.LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const helpers = {
    /** formatPrice(1250) -> "₹1,250" */
    formatPrice(amount) {
      const n = Number(amount);
      return `${SETTINGS.CURRENCY}${currencyFormatter.format(Number.isFinite(n) ? n : 0)}`;
    },

    /** Full URL for a named endpoint: url("ORDERS", "/abc") */
    url(endpointKey, suffix = "") {
      const path = SETTINGS.ENDPOINTS[endpointKey];
      if (!path) throw new Error(`Unknown endpoint: ${endpointKey}`);
      return `${SETTINGS.API_BASE_URL}${path}${suffix}`;
    },

    /** Namespaced localStorage key: storageKey("cart") */
    storageKey(name) {
      return `${SETTINGS.STORAGE_PREFIX}${name}`;
    },

    /** Table id from the QR link, e.g. ?table=5 or ?table=T5 -> "T5" */
    getTableFromUrl() {
      const raw = new URLSearchParams(location.search).get(
        SETTINGS.TABLE_QUERY_PARAM,
      );
      if (!raw) return null;
      const num = String(raw).trim().replace(/^t/i, "");
      if (!/^\d{1,3}$/.test(num)) return null;
      const n = parseInt(num, 10);
      if (n < 1 || n > SETTINGS.TABLE_COUNT) return null;
      return `${SETTINGS.TABLE_PREFIX}${String(n).padStart(2, "0")}`; // T05, matches API ids
    },

    /** Price breakdown used by cart and order summary. */
    calculateTotals(subtotal) {
      const base = Math.max(0, Number(subtotal) || 0);
      const service = (base * SETTINGS.SERVICE_CHARGE_PERCENT) / 100;
      const taxable = base + service;
      let tax;
      let total;
      if (SETTINGS.PRICES_INCLUDE_TAX) {
        tax = taxable - taxable / (1 + SETTINGS.GST_PERCENT / 100);
        total = taxable;
      } else {
        tax = (taxable * SETTINGS.GST_PERCENT) / 100;
        total = taxable + tax;
      }
      const r = (x) => Math.round(x * 100) / 100;
      return {
        subtotal: r(base),
        service: r(service),
        tax: r(tax),
        total: r(total),
      };
    },
        /** Called by api.js with the owner's live tax settings from the server. */
    setTax(t) {
      if (!t) return;
      const g = Number(t.gstPercent), sv = Number(t.servicePercent);
      if (Number.isFinite(g) && g >= 0 && g <= 100) SETTINGS.GST_PERCENT = g;
      if (Number.isFinite(sv) && sv >= 0 && sv <= 100) SETTINGS.SERVICE_CHARGE_PERCENT = sv;
      if (typeof t.pricesIncludeTax === "boolean") SETTINGS.PRICES_INCLUDE_TAX = t.pricesIncludeTax;
    },
  };

  

  /* ======================================================================
     PUBLISH
     ====================================================================== */
  const deepFreeze = (obj) => {
    Object.getOwnPropertyNames(obj).forEach((k) => {
      const v = obj[k];
      if (v && typeof v === "object") deepFreeze(v);
    });
    return Object.freeze(obj);
  };

  const base = Object.assign({}, SETTINGS, { helpers: Object.freeze(helpers) });
  ["GST_PERCENT", "SERVICE_CHARGE_PERCENT", "PRICES_INCLUDE_TAX"].forEach((k) =>
    Object.defineProperty(base, k, { get: () => SETTINGS[k], enumerable: true }),
  );
  const config = deepFreeze(base);
  
  window.APP_CONFIG = config;

  warnings.forEach((w) => console.warn(`[config] ${w}`));
  if (errors.length) {
    console.error(
      `[config] ${errors.length} problem(s) found:\n - ` + errors.join("\n - "),
    );
    window.APP_CONFIG_ERRORS = Object.freeze(errors.slice());
  }
})();
