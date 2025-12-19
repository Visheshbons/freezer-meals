import dotenv from "dotenv";
import express from "express";
import cookieParser from "cookie-parser";
import chalk from "chalk";
import Stripe from "stripe";
import argon2 from "argon2";
import { randomUUID } from "crypto";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe =
  stripeSecretKey && stripeSecretKey.startsWith("sk_")
    ? new Stripe(stripeSecretKey)
    : null;
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";

const adminPasswordHashEnv = process.env.ADMIN_PASSWORD_HASH || "";
const adminPasswordPlain = process.env.ADMIN_PASSWORD || "";
let adminPasswordHash = adminPasswordHashEnv;
const adminSessions = new Set();
const orders = [];

if (!stripeSecretKey) {
  console.log(
    chalk.yellow("Stripe secret key missing; payments are disabled."),
  );
}
if (!stripePublishableKey) {
  console.log(
    chalk.yellow(
      "Stripe publishable key missing; client Elements will be disabled.",
    ),
  );
}

async function verifyAdminPassword(input) {
  if (!input) return false;
  if (!adminPasswordHash) {
    if (!adminPasswordPlain) return false;
    adminPasswordHash = await argon2.hash(adminPasswordPlain);
  }
  try {
    return await argon2.verify(adminPasswordHash, input);
  } catch (_e) {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const token = req.cookies.admin_session;
  if (token && adminSessions.has(token)) {
    return next();
  }
  return res.redirect("/admin/login");
}

// Set EJS as view engine
app.set("view engine", "ejs");
app.set("views", "./views");

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Hardcoded data
const data = {
  founders: [
    {
      name: "Zach",
      role: "Useless Fellow",
      bio: "Zach is the useless guy who didn't give me a role to put in the website.",
      image: "/images/Image_20251218_1651544717311805519586647.jpeg",
    },
    {
      name: "Emma",
      role: "Betrayed Fellow",
      bio: "Emma is the poor victim of Zach's lazyness when I asked for a role.",
      image: "https://placehold.co/320x240/png",
    },
    {
      name: "Vishesh",
      role: "Web Developer",
      bio: "Vishesh is the web developer who created this website.",
      image: "/images/20251219_170912.jpg",
    },
  ],
};

app.get("/", (req, res) => {
  res.render("index", { data });
});

app.get("/how", (req, res) => res.render("how", { data }));
app.get("/menu", (req, res) => res.render("menu", { data }));
app.get("/founders", (req, res) => res.render("founders", { data }));
app.get("/order", (req, res) =>
  res.render("order", { data, stripePublishableKey }),
);
app.get("/contact", (req, res) => res.render("contact", { data }));
app.get("/reviews", (req, res) => res.render("reviews", { data }));
app.get("/newsletter", (req, res) => res.render("newsletter", { data }));
app.get("/faq", (req, res) => res.render("faq", { data }));

app.get("/admin/login", (req, res) => {
  if (adminSessions.has(req.cookies.admin_session || "")) {
    return res.redirect("/admin");
  }
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Login</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; display: grid; place-items: center; height: 100vh; margin: 0; }
    form { background: #111827; padding: 24px; border-radius: 12px; width: 320px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 20px 40px rgba(0,0,0,0.35); }
    label { display: block; margin-bottom: 8px; color: #cbd5e1; font-weight: 600; }
    input { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: #e2e8f0; }
    button { margin-top: 12px; width: 100%; padding: 12px; border-radius: 10px; border: none; background: linear-gradient(135deg, #10b981, #38bdf8); color: #0b1221; font-weight: 700; cursor: pointer; }
  </style>
</head>
<body>
  <form method="POST" action="/admin/login">
    <label for="password">Admin Password</label>
    <input type="password" id="password" name="password" required autofocus />
    <button type="submit">Login</button>
  </form>
</body>
</html>`);
});

app.post("/admin/login", async (req, res) => {
  const { password } = req.body;
  const ok = await verifyAdminPassword(password);
  if (!ok) {
    return res.status(401).send("Invalid password");
  }
  const token = randomUUID();
  adminSessions.add(token);
  res.cookie("admin_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 6,
  });
  res.redirect("/admin");
});

app.post("/admin/logout", (req, res) => {
  const token = req.cookies.admin_session;
  if (token) {
    adminSessions.delete(token);
  }
  res.clearCookie("admin_session");
  res.redirect("/admin/login");
});

app.get("/admin", requireAdmin, (req, res) => {
  const rows =
    orders.length === 0
      ? "<tr><td colspan='8' style='padding: 12px; text-align:center; color:#cbd5e1;'>No orders yet</td></tr>"
      : orders
          .map(
            (o) => `<tr>
              <td>${o.id}</td>
              <td>${o.createdAt}</td>
              <td>${o.items?.length || 0}</td>
              <td>${o.currency?.toUpperCase() || "USD"}</td>
              <td>${(o.amount / 100).toFixed(2)}</td>
              <td>${o.status || "pending"}</td>
              <td>${[o.delivery?.name, o.delivery?.address, o.delivery?.phone].filter(Boolean).join(" · ")}</td>
              <td>
                <form method="POST" action="/admin/orders/${o.id}/status" style="display:flex; gap:6px; align-items:center; margin:0;">
                  <select name="status" style="background: rgba(255,255,255,0.03); color:#e2e8f0; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:6px 8px;">
                    ${["pending", "preparing", "shipped", "delivered", "cancelled"].map((s) => `<option value=\"${s}\" ${o.status === s ? "selected" : ""}>${s}</option>`).join("")}
                  </select>
                  <button type="submit" class="btn" style="padding:8px 10px;">Update</button>
                </form>
              </td>
            </tr>`,
          )
          .join("");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Dashboard</title>
  <style>
    body { font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 0; }
    header { padding: 16px 24px; background: rgba(17,24,39,0.9); border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; }
    main { padding: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid rgba(255,255,255,0.08); padding: 10px; text-align: left; }
    th { color: #cbd5e1; font-size: 0.9rem; }
    tr:hover { background: rgba(255,255,255,0.04); }
    .btn { color: #0b1221; background: linear-gradient(135deg, #10b981, #38bdf8); padding: 10px 14px; border-radius: 10px; text-decoration: none; font-weight: 700; border: none; }
    form { margin: 0; }
  </style>
</head>
<body>
  <header>
    <div><strong>Admin Dashboard</strong></div>
    <form method="POST" action="/admin/logout"><button class="btn" type="submit">Logout</button></form>
  </header>
  <main>
    <h2>Orders</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Created</th>
          <th>Items</th>
          <th>Currency</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Delivery</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>`);
});

app.get("/admin/orders", requireAdmin, (req, res) => {
  res.json({ orders });
});

app.post("/admin/orders/:id/status", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const allowed = ["pending", "preparing", "shipped", "delivered", "cancelled"];
  const order = orders.find((o) => o.id === id);
  if (!order) {
    return res.status(404).send("Order not found");
  }
  if (allowed.includes(status)) {
    order.status = status;
  }
  res.redirect("/admin");
});

app.post("/contact", (req, res) => {
  console.log("Contact submission:", req.body);
  res.redirect("/contact");
});

app.post("/newsletter", (req, res) => {
  console.log("Newsletter signup:", req.body);
  res.redirect("/newsletter");
});

app.post("/api/payments/create-intent", async (req, res) => {
  try {
    if (!stripe) {
      return res
        .status(503)
        .json({ error: "Stripe not configured. Payments unavailable." });
    }
    const {
      amount,
      currency = "usd",
      items = [],
      delivery = {},
      notes = "",
    } = req.body;
    if (!amount || Number.isNaN(Number(amount))) {
      return res.status(400).json({ error: "Missing or invalid amount." });
    }
    const normalizedAmount = Math.round(Number(amount));
    const orderLog = {
      id: randomUUID(),
      amount: normalizedAmount,
      currency,
      items,
      delivery,
      notes,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    orders.push(orderLog);
    console.log("Order intent received:", orderLog);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: normalizedAmount,
      currency,
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Stripe payment intent error:", error);
    res.status(500).json({ error: "Unable to create payment intent." });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${chalk.green(port)}`);
});
