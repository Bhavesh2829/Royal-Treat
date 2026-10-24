/* ==========================================================================
   Royal Treat — QR Ordering System
   api.js · the ONLY file that knows about the backend.

   The UI calls Api.* and never touches fetch() directly.
   Load order:  config.js  ->  menu-data.js  ->  api.js  ->  app.js

   Public methods (all return Promises):
     Api.getRestaurant()            -> { name, isOpen }
     Api.getTables()                -> [{ id, label, status }]
     Api.getMenu({ force? })        -> { categories, items, stale }
     Api.createOrder(input)         -> { id, number, status }
     Api.getOrder(id)               -> { id, number, status }      (ORDER_TRACKING)
     Api.callWaiter({ table })      -> { ok: true }                (CALL_WAITER)
     Api.ApiError                   -> error class (err.userMessage is UI-safe)

   Backend contract (when USE_MOCK is false) — paths come from
   APP_CONFIG.ENDPOINTS:

     GET  /restaurant -> { name, isOpen }
     GET  /tables     -> [ { id: "T01", label: "T01", status: "available" } ]
     GET  /menu       -> { categories: [{ id, name, emoji?, image? }],
                           items: [{ id, category, name, price, veg,
                                     available?, image?, description?,
                                     priceLabel? }] }
                         (price may be null when priceLabel is set, e.g. "APS";
                          such items are shown but cannot be added to the cart)
     POST /orders     -> body:  { restaurantId, clientOrderId, table,
                                  items: [{ id, name, price, qty }],
                                  customer: { name, phone }, notes,
                                  paymentMethod, subtotal, service, tax,
                                  total, currency, createdAt }
                         reply: { id, number }
     GET  /orders/:id -> { id, number, status }   (received | preparing |
                                                   ready | served | cancelled)
     POST /waiter-calls -> body: { restaurantId, table }

   Responses may also be wrapped as { data: ... }; that is unwrapped for you.
   The server must recompute prices from its own menu. Never trust the totals
   sent by the browser. POST /orders also receives an "Idempotency-Key"
   header (= clientOrderId); dedupe on it to make double-submits harmless.

   If your field names differ, change them in the normalize* functions.
   ========================================================================== */
const Api = (() => {
  "use strict";

  const cfg = window.APP_CONFIG;
  if (!cfg) throw new Error("[api] config.js must be loaded before api.js");
  const { helpers } = cfg;

  // Waiter mode: index.html?waiter=KEY remembers the key for this tab only.
  const waiterKey = (() => {
    try {
      const p = new URLSearchParams(location.search).get("waiter");
      if (p) sessionStorage.setItem("rt-waiter", p);
      return sessionStorage.getItem("rt-waiter") || "";
    } catch (_) { return ""; }
  })();

  /* ======================================================================
     Utilities
     ====================================================================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, "0");
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const str = (v) => (v === undefined || v === null ? "" : String(v).trim());

  const uid = () =>
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const safeRead = (key, fallback) => {
    try {
      const raw = localStorage.getItem(helpers.storageKey(key));
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  };
  const safeWrite = (key, value) => {
    try {
      localStorage.setItem(helpers.storageKey(key), JSON.stringify(value));
    } catch (_) {
      /* storage full or blocked (private mode) — non-fatal */
    }
  };

  /* ======================================================================
     Errors
     ====================================================================== */
  const FRIENDLY = {
    TIMEOUT: "The server took too long to respond. Please try again.",
    NETWORK: "Can't reach the server. Check your internet connection.",
    INVALID_RESPONSE: "The server sent an unexpected response. Please try again.",
    HTTP_400: "Something in your order wasn't accepted. Please review it.",
    HTTP_401: "This device isn't authorised to place orders.",
    HTTP_403: "This device isn't authorised to place orders.",
    HTTP_404: "We couldn't find what you asked for.",
    HTTP_409: "This order was already received.",
    HTTP_422: "Something in your order wasn't accepted. Please review it.",
    HTTP_429: "Too many requests. Please wait a moment and try again.",
    HTTP_5XX: "Our kitchen system is having trouble. Please try again shortly.",
  };

  class ApiError extends Error {
    constructor(message, { status = 0, code = "UNKNOWN", retryable = false, details = null } = {}) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
      this.retryable = retryable;
      this.details = details;
    }
    /** Safe to show customers. Never contains stack traces or raw server text. */
    get userMessage() {
      if (this.code === "VALIDATION" || this.code === "DISABLED" || this.code === "CLOSED") {
        return this.message;
      }
      if (FRIENDLY[this.code]) return FRIENDLY[this.code];
      if (this.status >= 500) return FRIENDLY.HTTP_5XX;
      return "Something went wrong. Please try again.";
    }
  }

  const validationError = (message) => new ApiError(message, { code: "VALIDATION" });

  /* ======================================================================
     HTTP (real backend) — timeout, safe retries, clean errors
     ====================================================================== */
  const RETRY_STATUS_GET = new Set([408, 425, 429, 500, 502, 503, 504]);
  const RETRY_STATUS_POST = new Set([429, 503]); // server explicitly did NOT process it

  async function parseBody(res) {
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      if (res.ok) throw new ApiError("Non-JSON response", { status: res.status, code: "INVALID_RESPONSE" });
      return null;
    }
  }

  const unwrap = (body) =>
    body && typeof body === "object" && !Array.isArray(body) && "data" in body && Object.keys(body).length <= 2
      ? body.data
      : body;

  const extractMessage = (body) => {
    if (!body || typeof body !== "object") return "";
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
    return "";
  };

  async function once(url, { method, body, headers }) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.REQUEST_TIMEOUT_MS);
    try {
      let res;
      try {
        res = await fetch(url, {
          method,
          signal: ctrl.signal,
          body: body === undefined ? undefined : JSON.stringify(body),
          headers: {
            Accept: "application/json",
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...cfg.API_HEADERS,
            ...headers,
          },
        });
      } catch (e) {
        if (e.name === "AbortError") {
          throw new ApiError("Request timed out", { code: "TIMEOUT", retryable: true });
        }
        throw new ApiError(e.message || "Network error", { code: "NETWORK", retryable: true });
      }

      const data = await parseBody(res);
      if (!res.ok) {
        throw new ApiError(extractMessage(data) || `Request failed (${res.status})`, {
          status: res.status,
          code: `HTTP_${res.status}`,
          retryable: RETRY_STATUS_GET.has(res.status),
          details: data,
        });
      }
      return unwrap(data);
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(url, options = {}) {
    const { method = "GET", body, headers = {} } = options;
    const maxAttempts = 1 + cfg.RETRY_ATTEMPTS;
    for (let attempt = 1; ; attempt++) {
      try {
        return await once(url, { method, body, headers });
      } catch (err) {
        // GETs retry on any transient failure. POSTs retry only when the
        // server clearly refused the request, so orders are never duplicated.
        const safeToRetry =
          method === "GET" ? err.retryable : RETRY_STATUS_POST.has(err.status);
        if (!safeToRetry || attempt >= maxAttempts) throw err;
        await sleep(cfg.RETRY_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  /* ======================================================================
     Normalizers — map YOUR backend fields -> UI fields
     ====================================================================== */
  const toArray = (v, key) =>
    Array.isArray(v) ? v : Array.isArray(v?.[key]) ? v[key] : [];

  const normalizeRestaurant = (r) => {
    if (r && r.gstPercent !== undefined) helpers.setTax(r);   // owner's live GST
    return { name: str(r?.name) || cfg.RESTAURANT_NAME, isOpen: r?.isOpen !== false };
  };

  const normalizeTable = (t) => ({
    id: str(t?.id),
    label: str(t?.label) || str(t?.id),
    status: str(t?.status) || "available",
  });

  function normalizeMenu(m) {
    const categories = toArray(m, "categories")
      .filter((c) => c && str(c.id) && str(c.name))
      .map((c) => ({
        id: str(c.id),
        name: str(c.name),
        emoji: c.emoji || "🍽️",
        image: c.image || "",
      }));

    const known = new Set(categories.map((c) => c.id));
    const seen = new Set();
    const items = [];

    toArray(m, "items").forEach((i) => {
      const id = str(i?.id);
      const category = str(i?.category);
      const priceLabel = str(i?.priceLabel); // e.g. "APS" (price on request)
      const hasPrice =
        i?.price !== null && i?.price !== undefined && str(i.price) !== "" &&
        Number.isFinite(Number(i.price)) && Number(i.price) > 0;
      const priceOnRequest = !hasPrice && !!priceLabel;
      if (!id || !str(i?.name) || (!hasPrice && !priceOnRequest)) {
        console.warn("[api] skipped invalid menu item:", i);
        return;
      }
      if (seen.has(id)) {
        console.warn(`[api] duplicate menu item id "${id}" skipped`);
        return;
      }
      if (!known.has(category)) {
        console.warn(`[api] item "${i.name}" has unknown category "${category}" and was skipped`);
        return;
      }
      seen.add(id);
      items.push({
        id,
        category,
        name: str(i.name),
        price: hasPrice ? Number(i.price) : null,
        priceLabel,
        priceOnRequest,
        veg: !!i.veg,
        available: i.available !== false,
        // true only when the customer can add it to the cart
        orderable: i.available !== false && hasPrice,
        image: i.image || null,
        description: str(i.description),
      });
    });

    return { categories, items };
  }

  const normalizeOrderReply = (r, fallbackNumber) => {
    const id = str(r?.id ?? r?.orderId);
    if (!id) throw new ApiError("Order reply had no id", { code: "INVALID_RESPONSE" });
    return {
      id,
      number: r?.number ?? r?.orderNumber ?? fallbackNumber ?? id,
      status: str(r?.status) || "received",
    };
  };

  /* ======================================================================
     Order validation — runs before ANY network call
     ====================================================================== */
  function cleanPhone(raw) {
    let digits = str(raw).replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    return digits;
  }

  function buildOrderPayload(input = {}) {
    const table = str(input.table);
    if (!table) throw validationError("Table not detected. Please scan the QR code on your table again.");

    // Merge duplicate lines and sanity-check each one.
    const merged = new Map();
    (Array.isArray(input.items) ? input.items : []).forEach((raw) => {
      const id = str(raw?.id);
      const price = Number(raw?.price);
      const qty = Math.floor(Number(raw?.qty));
      if (!id || !str(raw?.name) || raw?.price == null || !Number.isFinite(price) || price <= 0 || !(qty > 0)) {
        throw validationError("One of the items in your cart is invalid. Please remove it and try again.");
      }
      const line = merged.get(id) || { id, name: str(raw.name), price, qty: 0 };
      line.qty += qty;
      merged.set(id, line);
    });
    const items = [...merged.values()];

    if (items.length === 0) throw validationError("Your cart is empty.");
    if (items.length > cfg.MAX_ITEMS_PER_ORDER) {
      throw validationError(`You can order up to ${cfg.MAX_ITEMS_PER_ORDER} different items at once.`);
    }
    const tooMany = items.find((l) => l.qty > cfg.MAX_QTY_PER_ITEM);
    if (tooMany) {
      throw validationError(`You can order at most ${cfg.MAX_QTY_PER_ITEM} of "${tooMany.name}".`);
    }

    const name = str(input.customer?.name).slice(0, 60);
    const phone = cleanPhone(input.customer?.phone);
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      throw validationError("Please enter a valid 10-digit mobile number.");
    }

    const rawSubtotal = items.reduce((sum, l) => sum + l.price * l.qty, 0);
    if (cfg.MIN_ORDER_VALUE > 0 && rawSubtotal < cfg.MIN_ORDER_VALUE) {
      throw validationError(`Minimum order is ${helpers.formatPrice(cfg.MIN_ORDER_VALUE)}.`);
    }
    const totals = helpers.calculateTotals(rawSubtotal);

    const paymentMethod = cfg.PAYMENT_METHODS.includes(input.paymentMethod)
      ? input.paymentMethod
      : cfg.PAYMENT_METHODS[0];

    return {
      restaurantId: cfg.RESTAURANT_ID,
      clientOrderId: str(input.clientOrderId) || uid(),
      table,
      items,
      customer: { name, phone },
      notes: cfg.FEATURES.ORDER_NOTES ? str(input.notes).slice(0, cfg.NOTE_MAX_LENGTH) : "",
      paymentMethod,
      subtotal: totals.subtotal,
      service: totals.service,
      tax: totals.tax,
      total: totals.total,
      currency: cfg.CURRENCY,
      createdAt: new Date().toISOString(),
    };
  }

  /* ======================================================================
     MOCK backend (localStorage) — for demos and design review
     ====================================================================== */
  const ORDERS_KEY = "mock-orders";
  const MENU_CACHE_KEY = "menu-cache";

  const mockOrders = {
    all: () => safeRead(ORDERS_KEY, {}),
    save: (o) => safeWrite(ORDERS_KEY, o),
  };

  // Fake kitchen progress so order tracking can be demoed without a server.
  const mockStatus = (createdAt) => {
    const s = (Date.now() - createdAt) / 1000;
    if (s < 30) return "received";
    if (s < 90) return "preparing";
    if (s < 180) return "ready";
    return "served";
  };

  const mock = {
    async getRestaurant() {
      await sleep(150);
      return { name: cfg.RESTAURANT_NAME, isOpen: true };
    },
    async getTables() {
      await sleep(150);
      return Array.from({ length: cfg.TABLE_COUNT }, (_, i) => {
        const id = cfg.TABLE_PREFIX + pad(i + 1);
        return { id, label: id, status: "available" };
      });
    },
    async getMenu() {
      await sleep(350);
      if (!window.MOCK_MENU) {
        throw new ApiError("MOCK_MENU missing. Load menu-data.js before api.js.", { code: "INVALID_RESPONSE" });
      }
      return clone(window.MOCK_MENU);
    },
    async createOrder(payload) {
      await sleep(600);
      const orders = mockOrders.all();
      // Same clientOrderId twice = same order (mirrors a real idempotent API).
      const existing = Object.values(orders).find((o) => o.clientOrderId === payload.clientOrderId);
      if (existing) return { id: existing.id, number: existing.number, status: mockStatus(existing.createdAt) };

      const number = Math.max(1000, ...Object.values(orders).map((o) => Number(o.number) || 0)) + 1;
      const order = { id: `RT-${number}`, number, createdAt: Date.now(), ...payload };
      orders[order.id] = order;
      mockOrders.save(orders);
      return { id: order.id, number, status: "received" };
    },
    async getOrder(id) {
      await sleep(150);
      const o = mockOrders.all()[id];
      if (!o) throw new ApiError("Order not found", { status: 404, code: "HTTP_404" });
      return { id: o.id, number: o.number, status: mockStatus(o.createdAt) };
    },
    async callWaiter() {
      await sleep(300);
      return { ok: true };
    },
  };

  /* ======================================================================
     REAL backend
     ====================================================================== */
  const real = {
    getRestaurant: () => request(helpers.url("RESTAURANT")),
    getTables: () => request(helpers.url("TABLES")),
    getMenu: () => request(helpers.url("MENU")),
    createOrder: (payload) =>
      request(helpers.url("ORDERS"), {
        method: "POST",
        body: payload,
        headers: { "Idempotency-Key": payload.clientOrderId, ...(waiterKey ? { "X-Waiter-Key": waiterKey } : {}) },
      }),
    getOrder: (id) => request(helpers.url("ORDERS", `/${encodeURIComponent(id)}`)),
    callWaiter: (payload) =>
      request(helpers.url("WAITER_CALLS"), { method: "POST", body: payload }),
  };

  const src = cfg.USE_MOCK ? mock : real;

    // Keep GST in sync if the owner changes it while a customer has the page open.
  if (!cfg.USE_MOCK) {
    const syncTax = () => real.getRestaurant().then(normalizeRestaurant).catch(() => {});
    setInterval(() => { if (!document.hidden) syncTax(); }, 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) syncTax(); });
  }

  /* ======================================================================
     Public API
     ====================================================================== */
  const MENU_TTL_MS = 60 * 1000;
  let menuCache = null;      // { at, data }
  let orderInFlight = null;  // blocks double-taps on "Place order"

  return Object.freeze({
    ApiError,
    isMock: cfg.USE_MOCK,

    async getRestaurant() {
      try {
        return normalizeRestaurant(await src.getRestaurant());
      } catch (err) {
        // A missing restaurant record must never block ordering.
        console.warn("[api] getRestaurant failed, using defaults:", err.message);
        return normalizeRestaurant();
      }
    },

    async getTables() {
      const rows = toArray(await src.getTables(), "tables");
      return rows.map(normalizeTable).filter((t) => t.id);
    },

    async getMenu({ force = false } = {}) {
      if (!force && menuCache && Date.now() - menuCache.at < MENU_TTL_MS) {
        return menuCache.data;
      }
      try {
        const data = { ...normalizeMenu(await src.getMenu()), stale: false };
        menuCache = { at: Date.now(), data };
        safeWrite(MENU_CACHE_KEY, { at: Date.now(), menu: { categories: data.categories, items: data.items } });
        return data;
      } catch (err) {
        // Offline or server down: show the last good menu instead of a blank page.
        const saved = safeRead(MENU_CACHE_KEY, null);
        if (saved?.menu) {
          console.warn("[api] getMenu failed, serving saved menu:", err.message);
          return { ...normalizeMenu(saved.menu), stale: true };
        }
        throw err;
      }
    },

    async createOrder(input) {
      if (orderInFlight) return orderInFlight;
      orderInFlight = (async () => {
        const payload = buildOrderPayload(input); // validates; throws ApiError(VALIDATION)
        const reply = await src.createOrder(payload);
        return normalizeOrderReply(reply);
      })();
      try {
        return await orderInFlight;
      } finally {
        orderInFlight = null;
      }
    },

    async getOrder(id) {
      if (!cfg.FEATURES.ORDER_TRACKING) {
        throw new ApiError("Order tracking is turned off.", { code: "DISABLED" });
      }
      const r = await src.getOrder(id);
      return normalizeOrderReply(r);
    },

    async callWaiter({ table } = {}) {
      if (!cfg.FEATURES.CALL_WAITER) {
        throw new ApiError("Calling a waiter is not available right now.", { code: "DISABLED" });
      }
      if (!str(table)) throw validationError("Table not detected. Please scan the QR code again.");
      await src.callWaiter({ restaurantId: cfg.RESTAURANT_ID, table: str(table) });
      return { ok: true };
    },
  });
})();