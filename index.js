import express from "express";
import cookieParser from "cookie-parser";
import chalk from "chalk";

const app = express();
const port = process.env.PORT || 3000;

// Set EJS as view engine
app.set("view engine", "ejs");
app.set("views", "./views");

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/how", (req, res) => res.render("how"));
app.get("/menu", (req, res) => res.render("menu"));
app.get("/founders", (req, res) => res.render("founders"));
app.get("/order", (req, res) => res.render("order"));
app.get("/contact", (req, res) => res.render("contact"));
app.get("/reviews", (req, res) => res.render("reviews"));
app.get("/newsletter", (req, res) => res.render("newsletter"));
app.get("/faq", (req, res) => res.render("faq"));
app.get("/allergens", (req, res) => res.render("allergens"));

app.post("/contact", (req, res) => {
  console.log("Contact submission:", req.body);
  res.redirect("/contact");
});

app.post("/newsletter", (req, res) => {
  console.log("Newsletter signup:", req.body);
  res.redirect("/newsletter");
});

app.listen(port, () => {
  console.log(`Server is running on port ${chalk.green(port)}`);
});
