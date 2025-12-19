import dotenv from "dotenv";
import express from "express";
import cookieParser from "cookie-parser";
import chalk from "chalk";
import Stripe from "stripe";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe =
  stripeSecretKey && stripeSecretKey.startsWith("sk_")
    ? new Stripe(stripeSecretKey)
    : null;
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || "";

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
      image: "https://placehold.co/320x240/png",
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
app.get("/allergens", (req, res) => res.render("allergens", { data }));

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
      amount: normalizedAmount,
      currency,
      items,
      delivery,
      notes,
      createdAt: new Date().toISOString(),
    };
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
