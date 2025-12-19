/* Persistent order banner shown across the site.
 * - Stores a lightweight summary in a cookie `fm_order_summary` (JSON).
 * - If the URL contains `status=success` and `localStorage.fm_last_order`
 *   exists, it will promote that into the cookie.
 * - Renders a semi-transparent bar above the bottom of the viewport.
 */

const COOKIE_NAME = "fm_order_summary";
const COOKIE_MAX_DAYS = 30;
const BANNER_ID = "fm-order-banner";

function getCookie(name) {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name, value, days = COOKIE_MAX_DAYS) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; expires=${expires}; path=/; SameSite=Lax`;
}

function maybePromotePendingOrder() {
  const params = new URLSearchParams(window.location.search);
  const isSuccess = params.get("status") === "success";
  const pending = window.localStorage.getItem("fm_last_order");
  if (isSuccess && pending) {
    setCookie(COOKIE_NAME, pending);
    // Optionally clear pending cache after promotion
    window.localStorage.removeItem("fm_last_order");
  }
}

function parseSummary() {
  const raw = getCookie(COOKIE_NAME);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

function formatCurrency(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  } catch (_e) {
    return `$${(amount / 100).toFixed(2)}`;
  }
}

function buildBanner(summary) {
  if (!summary) return;

  if (document.getElementById(BANNER_ID)) return;

  const bar = document.createElement("div");
  bar.id = BANNER_ID;
  bar.style.position = "fixed";
  bar.style.left = "16px";
  bar.style.right = "16px";
  bar.style.bottom = "12px";
  bar.style.zIndex = "9999";
  bar.style.backdropFilter = "blur(8px)";
  bar.style.border = "1px solid rgba(255, 255, 255, 0.1)";
  bar.style.borderRadius = "14px";
  bar.style.overflow = "hidden";
  bar.style.padding = "12px 16px";
  bar.style.display = "flex";
  bar.style.alignItems = "center";
  bar.style.justifyContent = "space-between";
  bar.style.gap = "12px";
  bar.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
  bar.style.color = "#e2e8f0";

  const left = document.createElement("div");
  left.style.display = "flex";
  left.style.flexDirection = "column";
  left.style.gap = "2px";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.textContent = "Your recent order";

  const details = document.createElement("div");
  details.style.fontSize = "0.95rem";
  details.style.color = "#cbd5e1";

  const itemsPart =
    summary.itemsCount != null
      ? `${summary.itemsCount} item${summary.itemsCount === 1 ? "" : "s"}`
      : null;
  const totalPart =
    summary.amount != null
      ? formatCurrency(summary.amount, summary.currency || "USD")
      : null;
  const deliveryPart = summary.deliveryWindow
    ? `Delivery: ${summary.deliveryWindow}`
    : null;

  details.textContent = [itemsPart, totalPart, deliveryPart]
    .filter(Boolean)
    .join(" · ");

  left.appendChild(title);
  left.appendChild(details);

  const right = document.createElement("div");
  right.style.display = "flex";
  right.style.gap = "8px";
  right.style.alignItems = "center";

  const viewBtn = document.createElement("a");
  viewBtn.href = "/order?status=success";
  viewBtn.textContent = "View order";
  viewBtn.style.padding = "10px 14px";
  viewBtn.style.borderRadius = "999px";
  viewBtn.style.border = "1px solid rgba(255,255,255,0.15)";
  viewBtn.style.background = "rgba(255,255,255,0.08)";
  viewBtn.style.color = "#e2e8f0";
  viewBtn.style.fontWeight = "600";
  viewBtn.style.textDecoration = "none";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.ariaLabel = "Hide order banner";
  closeBtn.textContent = "×";
  closeBtn.style.border = "none";
  closeBtn.style.background = "transparent";
  closeBtn.style.color = "#cbd5e1";
  closeBtn.style.fontSize = "1.2rem";
  closeBtn.style.cursor = "pointer";
  closeBtn.addEventListener("click", () => {
    bar.remove();
  });

  right.appendChild(viewBtn);
  right.appendChild(closeBtn);

  bar.appendChild(left);
  bar.appendChild(right);

  document.body.appendChild(bar);
}

(function init() {
  // Promote any pending order to cookie after redirect back with success flag.
  maybePromotePendingOrder();

  const summary = parseSummary();
  if (summary) {
    buildBanner(summary);
  }
})();
