/* Interactive multi-step order flow with Stripe payment element */

const appEl = document.querySelector("#order-app");
if (!appEl) {
  // Page not present; nothing to do.
} else {
  const stripePublishableKey = appEl.dataset.stripeKey || "";
  const freeDeliveryThreshold =
    Number(appEl.dataset.deliveryFreeThreshold) || 75;
  const shippingFee = Number(appEl.dataset.shippingFee) || 8;

  const stepPanels = Array.from(
    document.querySelectorAll("[data-step-panel]"),
  ).reduce((acc, el) => {
    acc[Number(el.dataset.stepPanel)] = el;
    return acc;
  }, {});
  const progressDots = Array.from(
    document.querySelectorAll(".progress-step"),
  ).reduce((acc, el) => {
    acc[Number(el.dataset.step)] = el;
    return acc;
  }, {});
  let currentStep = 1;

  const cartListEl = document.querySelector("#cart-list");
  const subtotalEl = document.querySelector("#summary-subtotal");
  const shippingEl = document.querySelector("#summary-shipping");
  const totalEl = document.querySelector("#summary-total");
  const deliveryForm = document.querySelector("#delivery-form");

  const quantities = {};
  const prices = {};
  const names = {};
  const qtyDisplays = {};
  let stripeController = null;

  function setQuantity(id, nextVal) {
    const clamped = Math.max(0, Number(nextVal) || 0);
    quantities[id] = clamped;
    if (qtyDisplays[id]) qtyDisplays[id].textContent = clamped;
    updateSummary();
  }

  // Initialize meal cards and quantity controls
  document.querySelectorAll(".meal-card").forEach((card) => {
    const id = card.dataset.mealId;
    const price = Number(card.dataset.mealPrice) || 0;
    const name = card.querySelector("h4")?.textContent?.trim() || id;
    prices[id] = price;
    names[id] = name;
    quantities[id] = quantities[id] || 0;

    const qtyEl = card.querySelector("[data-qty]");
    qtyDisplays[id] = qtyEl;

    card.querySelectorAll(".qty-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        const nextVal =
          action === "incr" ? quantities[id] + 1 : quantities[id] - 1;
        setQuantity(id, nextVal);
      });
    });

    setQuantity(id, quantities[id]);
  });

  // Quick-add buttons outside cards
  document.querySelectorAll("[data-add-meal]").forEach((btn) => {
    const mealId = btn.dataset.addMeal;
    if (!mealId) return;
    btn.addEventListener("click", () => {
      setQuantity(mealId, (quantities[mealId] || 0) + 1);
    });
  });

  // Step navigation
  function showStep(target) {
    Object.entries(stepPanels).forEach(([step, panel]) => {
      const isActive = Number(step) === target;
      panel.classList.toggle("hidden", !isActive);
    });
    Object.entries(progressDots).forEach(([step, dot]) => {
      const isActive = Number(step) === target;
      dot.classList.toggle("active", isActive);
    });
    currentStep = target;
    if (currentStep === 3) {
      updateSummary();
      initializeStripe();
    }
  }

  document.querySelectorAll("[data-next-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (currentStep === 1 && totalMeals() === 0) {
        alert("Please add at least one meal to continue.");
        return;
      }
      if (currentStep === 2 && deliveryForm && !deliveryForm.checkValidity()) {
        deliveryForm.reportValidity();
        return;
      }
      showStep(Math.min(3, currentStep + 1));
    });
  });

  document.querySelectorAll("[data-prev-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showStep(Math.max(1, currentStep - 1));
    });
  });

  // Cart math + summary
  function totalMeals() {
    return Object.values(quantities).reduce((a, b) => a + b, 0);
  }

  function calculateTotals() {
    const subtotal = Object.entries(quantities).reduce(
      (sum, [id, qty]) => sum + qty * (prices[id] || 0),
      0,
    );
    const shipping =
      subtotal === 0 || subtotal >= freeDeliveryThreshold ? 0 : shippingFee;
    const total = subtotal + shipping;
    return { subtotal, shipping, total };
  }

  function formatCurrency(num) {
    return `$${num.toFixed(2)}`;
  }

  function updateSummary() {
    const { subtotal, shipping, total } = calculateTotals();

    if (cartListEl) {
      cartListEl.innerHTML = "";
      Object.entries(quantities).forEach(([id, qty]) => {
        if (qty > 0) {
          const line = document.createElement("div");
          line.className = "cart-line";
          line.innerHTML = `
          <span>${names[id]} <small>×${qty}</small></span>
          <strong>${formatCurrency(qty * (prices[id] || 0))}</strong>
        `;
          cartListEl.appendChild(line);
        }
      });
      if (!cartListEl.children.length) {
        cartListEl.innerHTML = "<span>No meals selected yet.</span>";
      }
    }

    if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
    if (shippingEl) shippingEl.textContent = formatCurrency(shipping);
    if (totalEl) totalEl.textContent = formatCurrency(total);

    if (stripeController) {
      stripeController.updateAmount(Math.round(total * 100));
    }
  }

  // Stripe integration
  function createStripeController() {
    if (!stripePublishableKey || typeof Stripe === "undefined") return null;

    const stripe = Stripe(stripePublishableKey);
    const payButton = document.querySelector("#submit-payment");
    const messageEl = document.querySelector("#payment-message");
    const paymentElementContainer = document.querySelector("#payment-element");
    const form = document.querySelector("#payment-form");
    let elements = null;
    let clientSecret = null;
    let creatingIntent = false;

    async function ensurePaymentIntent(amount) {
      if (!payButton) return;
      if (!amount || amount < 50) {
        payButton.disabled = true;
        if (messageEl)
          messageEl.textContent = "Add meals to reach at least $0.50.";
        return;
      }
      if (creatingIntent) return;
      creatingIntent = true;
      payButton.disabled = true;
      if (messageEl) messageEl.textContent = "Preparing payment…";

      try {
        const items = Object.entries(quantities)
          .filter(([, qty]) => qty > 0)
          .map(([id, qty]) => ({
            id,
            name: names[id],
            qty,
            price: prices[id],
            lineTotal: qty * (prices[id] || 0),
          }));
        const delivery = deliveryForm
          ? {
              name: deliveryForm.name?.value || "",
              address1: deliveryForm.address1?.value || "",
              address2: deliveryForm.address2?.value || "",
              city: deliveryForm.city?.value || "",
              zip: deliveryForm.zip?.value || "",
              phone: deliveryForm.phone?.value || "",
              window: deliveryForm.deliveryWindow?.value || "",
              preference: deliveryForm.deliveryPref?.value || "",
            }
          : {};
        const notes = deliveryForm?.notes?.value || "";

        const res = await fetch("/api/payments/create-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            items,
            delivery,
            notes,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error || "Unable to create payment intent.");
        }

        // Cache summary for promotion by the banner after redirect
        try {
          window.localStorage.setItem(
            "fm_last_order",
            JSON.stringify({
              amount,
              currency: "usd",
              itemsCount: items.reduce((acc, it) => acc + (it.qty || 0), 0),
              deliveryWindow: delivery.window || "",
            }),
          );
        } catch (_e) {
          // ignore storage errors
        }

        clientSecret = data.clientSecret;
        if (!elements) {
          elements = stripe.elements({
            clientSecret,
            appearance: {
              theme: "night",
              variables: {
                colorBackground: "#0f172a",
                colorText: "#e2e8f0",
                colorPrimary: "#10b981",
                colorDanger: "#f87171",
                colorTextSecondary: "#cbd5e1",
                colorIcon: "#cbd5e1",
                fontFamily: "Inter, system-ui, sans-serif",
              },
            },
          });
          const paymentElement = elements.create("payment");
          paymentElement.mount(paymentElementContainer);
        } else {
          elements.update({
            clientSecret,
            appearance: {
              theme: "night",
              variables: {
                colorBackground: "#0f172a",
                colorText: "#e2e8f0",
                colorPrimary: "#10b981",
                colorDanger: "#f87171",
                colorTextSecondary: "#cbd5e1",
                colorIcon: "#cbd5e1",
                fontFamily: "Inter, system-ui, sans-serif",
              },
            },
          });
        }
        payButton.disabled = false;
        if (messageEl) messageEl.textContent = "";
      } catch (err) {
        if (messageEl)
          messageEl.textContent =
            err.message || "Unable to create payment intent.";
      } finally {
        creatingIntent = false;
      }
    }

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!elements || !clientSecret || !payButton) return;
      payButton.disabled = true;
      if (messageEl) messageEl.textContent = "Confirming payment…";
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + "/order?status=success",
          payment_method_data: {
            billing_details: {
              name: deliveryForm?.name?.value || "",
              phone: deliveryForm?.phone?.value || "",
            },
          },
        },
      });
      if (error) {
        payButton.disabled = false;
        if (messageEl)
          messageEl.textContent = error.message || "Payment failed.";
      }
    });

    return {
      updateAmount: (amount) => ensurePaymentIntent(amount),
    };
  }

  function initializeStripe() {
    if (!stripeController) {
      stripeController = createStripeController();
    }
    if (stripeController) {
      const { total } = calculateTotals();
      stripeController.updateAmount(Math.round(total * 100));
    }
  }

  // Initialize
  showStep(1);
  updateSummary();
}
